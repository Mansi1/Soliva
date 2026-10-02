// Hosting von Soliva auf AWS: S3 + CloudFront für das Spiel und für die Previews der PRs.
// Bedienung und erster Deploy: infra/README.md. Einstellungen aus infra/.env.local (Vorlage: ../.env.example).
import { fileURLToPath } from 'node:url';
import { App, CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';

// ponytail: vorerst nur soliva.mannseicher.com. game.mannseicher.com zeigt per CNAME auf Vercel, und dessen
// CAA-Eintrag lässt Amazon keine Zertifikate ausstellen. Als zweiten Namen (Zertifikat + domainNames)
// ergänzen, sobald game kein CNAME auf Vercel mehr ist (infra/README.md, „Umzug von game.mannseicher.com“).
const DOMAIN = 'soliva.mannseicher.com';
const REPO = 'Mansi1/Soliva';
// Der Name steht fest, damit die Workflows ihn aus vars.AWS_ACCOUNT_ID bilden können.
const DEPLOY_ROLE = 'soliva-github-deploy';

// Nicht im Repo, weil es öffentlich ist: Wer deployt, trägt die Adressen in infra/.env.local ein.
const budgetEmails = (process.env.BUDGET_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (budgetEmails.length === 0) throw new Error('BUDGET_EMAILS fehlt: in infra/.env.local eintragen (Vorlage: .env.example im Repo)');

const app = new App();
const env = (region: string) => ({ account: process.env.CDK_DEFAULT_ACCOUNT, region });
// Alles liegt in eu-central-1, nur das Zertifikat nicht: CloudFront nimmt Zertifikate allein aus us-east-1.
// Die ARN liest der Stack Soliva als Output von SolivaCertificate (schwache Referenz, cdk.json): Das
// Zertifikat lässt sich so ersetzen, etwa um einen Namen erweitern. Löschen verhindert ACM, solange
// CloudFront es nutzt.
const certificateStack = new Stack(app, 'SolivaCertificate', { env: env('us-east-1'), crossRegionReferences: true });
const stack = new Stack(app, 'Soliva', { env: env('eu-central-1'), crossRegionReferences: true });

/** Privater Bucket hinter einer eigenen Distribution. */
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
      functionAssociations: [{ function: fallback, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
    },
    defaultRootObject: 'index.html',
    ...props,
  });
  return { bucket, distribution };
}

// Das Zertifikat wartet beim ersten Deploy, bis der CNAME zur Bestätigung beim DNS-Anbieter steht.
const certificate = new acm.Certificate(certificateStack, 'Certificate', {
  domainName: DOMAIN,
  validation: acm.CertificateValidation.fromDns(),
});

// Abrechnung nach Verbrauch: CloudFront ist bis 1 TB und 10 Mio. Anfragen im Monat gratis.
// ponytail: kein Kostendeckel, nur der Budget-Alarm unten; auf den Flat-Rate-Plan wechseln (verlangt
// eine WAF an der Distribution, Plan in der Konsole buchen), wenn das Spiel kommerziell startet,
// der Verkehr Richtung 1 TB im Monat geht oder jemand die Dateien missbraucht.
// Alte Assets bleiben liegen: Offene Tabs laden nach einem Deploy noch Chunks des alten Stands nach.
const prod = site('Prod', { domainNames: [DOMAIN], certificate });

// Previews auf eigener Domain (*.cloudfront.net): Der Code eines PRs teilt so keinen Origin und keinen
// localStorage (Spielstände) mit dem Spiel.
const preview = site('Preview', {}, {
  lifecycleRules: [{ expiration: Duration.days(30) }],
});

// Warnt per Mail, wenn die Kosten des ganzen AWS-Kontos im Monat über 5 $ liegen oder laut Prognose
// darüber landen werden. Die Prognose meldet einen Ausreißer früher als die tatsächlichen Kosten.
new budgets.CfnBudget(stack, 'Budget', {
  budget: { budgetType: 'COST', timeUnit: 'MONTHLY', budgetLimit: { amount: 5, unit: 'USD' } },
  notificationsWithSubscribers: ['ACTUAL', 'FORECASTED'].map((notificationType) => ({
    notification: { notificationType, comparisonOperator: 'GREATER_THAN', threshold: 100, thresholdType: 'PERCENTAGE' },
    subscribers: budgetEmails.map((address) => ({ subscriptionType: 'EMAIL', address })),
  })),
});

// Den Anbieter für GitHub-OIDC gibt es je Konto nur einmal. Steht er schon, seine ARN in
// GITHUB_OIDC_PROVIDER_ARN eintragen, dann wird er übernommen statt neu angelegt.
const provider = process.env.GITHUB_OIDC_PROVIDER_ARN
  ? iam.OidcProviderNative.fromOidcProviderArn(stack, 'GitHubOidc', process.env.GITHUB_OIDC_PROVIDER_ARN)
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
