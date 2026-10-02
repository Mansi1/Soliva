// Hosting von Soliva auf AWS: S3 + CloudFront für das Spiel und für die Previews der PRs.
// Bedienung und erster Deploy: infra/README.md.
import { fileURLToPath } from 'node:url';
import { App, CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

const DOMAIN = 'game.mannseicher.com';
const REPO = 'Mansi1/Soliva';
// Der Name steht fest, damit die Workflows ihn aus vars.AWS_ACCOUNT_ID bilden können.
const DEPLOY_ROLE = 'soliva-github-deploy';

const app = new App();
// Alles in us-east-1: CloudFront nimmt Zertifikate und WAF nur von dort. Ein zweiter Stack in
// Europa nur für die Buckets brächte Referenzen über Regionen, aber kaum etwas: Die Dateien
// kommen fast immer aus dem Cache der Edge, der Ursprung zählt nur beim ersten Abruf.
const stack = new Stack(app, 'Soliva', { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' } });

/** Privater Bucket hinter einer eigenen Distribution. Die CloudFront Function bekommt jede Distribution
 *  einzeln: Mit dem Flat-Rate-Plan darf sie nicht mit einer anderen geteilt sein. */
function site(id: string, props: Partial<cloudfront.DistributionProps>, bucketProps: s3.BucketProps = {}) {
  const bucket = new s3.Bucket(stack, `${id}Files`, {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
    ...bucketProps,
  });
  const fallback = new cloudfront.Function(stack, `${id}SpaFallback`, {
    code: cloudfront.FunctionCode.fromFile({ filePath: fileURLToPath(new URL('spa-fallback.js', import.meta.url)) }),
    runtime: cloudfront.FunctionRuntime.JS_2_0,
  });
  const distribution = new cloudfront.Distribution(stack, `${id}Distribution`, {
    // LIST: Fehlende Dateien geben 404 statt 403. defaultRootObject verhindert die Liste der Schlüssel unter /.
    defaultBehavior: {
      origin: origins.S3BucketOrigin.withOriginAccessControl(bucket, {
        originAccessLevels: [cloudfront.AccessLevel.READ, cloudfront.AccessLevel.LIST],
      }),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      // Verwaltete Policy: Eigene Cache-Policies gibt es im Flat-Rate-Plan erst ab Business.
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      functionAssociations: [{ function: fallback, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
    },
    defaultRootObject: 'index.html',
    ...props,
  });
  return { bucket, distribution };
}

// Der Flat-Rate-Plan verlangt eine WAF und lässt sie nicht mehr lösen. Sie steht darum hier: Fehlte sie
// in der Vorlage, würde der nächste Deploy versuchen, sie von der Distribution zu nehmen, und scheitern.
// Ohne Regeln - Regeln nur hier ändern, nicht in der Konsole (sonst setzt der nächste Deploy sie zurück).
const waf = new wafv2.CfnWebACL(stack, 'Waf', {
  scope: 'CLOUDFRONT',
  defaultAction: { allow: {} },
  visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'soliva', sampledRequestsEnabled: true },
  rules: [],
});

// Das Zertifikat wartet beim ersten Deploy, bis der CNAME zur Bestätigung beim DNS-Anbieter steht.
const certificate = new acm.Certificate(stack, 'Certificate', {
  domainName: DOMAIN,
  validation: acm.CertificateValidation.fromDns(),
});

// Alte Assets bleiben liegen: Offene Tabs laden nach einem Deploy noch Chunks des alten Stands nach.
const prod = site('Prod', { domainNames: [DOMAIN], certificate, webAclId: waf.attrArn });

// Previews auf eigener Domain (*.cloudfront.net): Der Code eines PRs teilt so keinen Origin und keinen
// localStorage (Spielstände) mit dem Spiel. Bezahlt nach Verbrauch, ohne WAF.
const preview = site('Preview', {}, {
  lifecycleRules: [{ expiration: Duration.days(30) }],
});

// Den Anbieter für GitHub-OIDC gibt es je Konto nur einmal. Steht er schon, seine ARN mitgeben:
// `bunx cdk deploy -c githubOidcProvider=arn:aws:iam::<konto>:oidc-provider/token.actions.githubusercontent.com`
const providerArn: string | undefined = app.node.tryGetContext('githubOidcProvider');
const provider = providerArn
  ? iam.OidcProviderNative.fromOidcProviderArn(stack, 'GitHubOidc', providerArn)
  : new iam.OidcProviderNative(stack, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

// Nur Workflows auf main bekommen die Rolle: der Deploy nach jedem Push und der Preview-Upload
// (workflow_run läuft im Stand von main). Code aus PRs läuft nie mit diesen Rechten.
const role = new iam.Role(stack, 'DeployRole', {
  roleName: DEPLOY_ROLE,
  maxSessionDuration: Duration.hours(1),
  assumedBy: new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
    StringEquals: {
      'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      'token.actions.githubusercontent.com:sub': `repo:${REPO}:ref:refs/heads/main`,
    },
  }),
});
prod.bucket.grantRead(role);
prod.bucket.grantPut(role);
preview.bucket.grantReadWrite(role);
preview.bucket.grantDelete(role);
// Die Workflows lesen Bucket-Namen und Preview-Domain aus den Outputs.
role.addToPolicy(new iam.PolicyStatement({ actions: ['cloudformation:DescribeStacks'], resources: [stack.stackId] }));

new CfnOutput(stack, 'ProdBucket', { value: prod.bucket.bucketName });
new CfnOutput(stack, 'ProdDomain', { value: prod.distribution.distributionDomainName, description: `CNAME-Ziel für ${DOMAIN}` });
new CfnOutput(stack, 'PreviewBucket', { value: preview.bucket.bucketName });
new CfnOutput(stack, 'PreviewDomain', { value: preview.distribution.distributionDomainName });
