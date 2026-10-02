# Hosting auf AWS

Das Spiel ist eine statische Seite. `app.ts` (CDK) legt dafür an:

| Teil | Zweck |
|---|---|
| S3-Bucket + CloudFront (Prod) | `game.mannseicher.com`, mit WAF und ACM-Zertifikat, gedacht für den CloudFront-Flat-Rate-Plan |
| S3-Bucket + CloudFront (Preview) | ein Build je Pull Request unter `https://<id>.cloudfront.net/pr-<n>/`, Abrechnung nach Verbrauch, nach 30 Tagen ohne Push gelöscht |
| CloudFront Function `spa-fallback.js` | `/game/<seed>`, `/galerie` → `index.html` (200), fehlende Dateien → 404 |
| OIDC-Rolle `soliva-github-deploy` | GitHub Actions auf `main` darf in beide Buckets schreiben, sonst nichts |

Den Deploy machen die Workflows: `deploy-aws.yml` baut bei jedem Push auf `main` und lädt hoch
(`tools/deploy/s3-upload.sh`), bei einem PR baut es nur. `preview-aws.yml` lädt den PR-Build als
Preview hoch und schreibt den Link in den PR. `preview-aws.yml` läuft erst, wenn es auf `main` liegt.

Warum S3 + CloudFront und nicht Amplify oder Lightsail: Der Flat-Rate-Plan deckelt die Kosten
(Free 0 $ mit 100 GB, Pro 15 $ mit 50 TB im Monat, keine Überziehung). Amplify kostet 0,15 $/GB ohne Deckel
und hat kein Git LFS im Build-Image. Lightsail kann kein Brotli.

## Erster Deploy

Braucht: AWS-Zugang mit Admin-Rechten im Zielkonto (`aws login` bzw. `AWS_PROFILE`), bun, Zugang zum DNS
von `mannseicher.com` (GoDaddy) und Admin-Rechte im GitHub-Repo.

1. Einmal je Konto und Region: `cd infra && bun install && bunx cdk bootstrap aws://<konto>/us-east-1`.
2. `bunx cdk deploy`. Gibt es im Konto schon einen OIDC-Anbieter für GitHub (der Deploy scheitert dann
   an `token.actions.githubusercontent.com` already exists), seine ARN mitgeben:
   `bunx cdk deploy -c githubOidcProvider=arn:aws:iam::<konto>:oidc-provider/token.actions.githubusercontent.com`
   - dann bei jedem weiteren Deploy auch.
3. Während der Deploy wartet: In der ACM-Konsole (us-east-1) das Zertifikat öffnen und den CNAME zur
   Bestätigung bei GoDaddy anlegen. Der Deploy läuft weiter, sobald ACM ihn sieht (Minuten). Am Spiel
   ändert der Eintrag nichts.
4. Im GitHub-Repo unter Settings → Secrets and variables → Actions → Variables `AWS_ACCOUNT_ID` setzen.
5. In der CloudFront-Konsole die Prod-Distribution (Alias `game.mannseicher.com`) auf den Flat-Rate-Plan
   Free stellen. CDK kann das noch nicht ([aws-cdk#37857](https://github.com/aws/aws-cdk/issues/37857)).
6. Den Workflow `deploy-aws` auf `main` von Hand starten und auf der CloudFront-Adresse (Output
   `ProdDomain`) prüfen:
   ```bash
   d=https://<ProdDomain>
   curl -sI $d/ | grep -iE '^HTTP|cache-control'                      # 200, max-age=0
   curl -sI $d/game/Testseed | grep -i '^HTTP'                         # 200
   curl -sI $d/assets/gibtsnicht.js | grep -i '^HTTP'                  # 404
   curl -sI -H 'Accept-Encoding: br' $d/assets/$(curl -s $d/ | grep -o 'main-[^"]*\.js' | head -1) \
     | grep -iE 'content-encoding|cache-control'                       # br, immutable
   node tools/ui/smoke.mjs $d
   ```

## Umzug der Domain von Vercel

1. Ein bis zwei Tage vorher bei GoDaddy die TTL des CNAME `game` auf den kleinsten Wert setzen.
2. Den CNAME `game` von `…vercel-dns-017.com` auf den Output `ProdDomain` umstellen. Vercel liefert
   weiter aus, bis die alte TTL abgelaufen ist - kein Ausfall.
3. Prüfen: `curl -sI https://game.mannseicher.com/ | grep -iE 'server|x-cache'` zeigt CloudFront.
4. Ein bis zwei Wochen beobachten (CloudFront-Konsole: Anfragen, 4xx/5xx), dann das Vercel-Projekt
   von der Domain trennen und löschen. Die TTL wieder hochsetzen.

## Grenzen

- CloudFront komprimiert nur Dateien bis 10.000.000 Byte. Größere (heute `world-*.js`) lädt
  `s3-upload.sh` schon mit Brotli kodiert hoch. Wird das Bundle aufgeteilt, entfällt das.
- Alte Assets bleiben im Prod-Bucket liegen, weil offene Tabs nach einem Deploy noch alte Chunks nachladen.
  ponytail: nichts räumt sie ab; ein Aufräumen (alles, was in den letzten Builds nicht mehr vorkam)
  bauen, wenn der Bucket über die 5 GB S3-Gutschrift des Free-Plans wächst.
- Die WAF hat keine Regeln. Regeln nur in `app.ts` ändern, sonst setzt der nächste Deploy sie zurück.
