# Hosting auf AWS

Das Spiel ist eine statische Seite. `app.ts` (CDK) legt dafür zwei Stacks an: `Soliva` in
eu-central-1 mit allem außer dem Zertifikat, und `SolivaCertificate` in us-east-1 nur mit dem
ACM-Zertifikat, weil CloudFront Zertifikate allein aus us-east-1 annimmt.

| Teil | Zweck |
|---|---|
| S3-Bucket + CloudFront (Prod) | `game.mannseicher.com` mit ACM-Zertifikat |
| S3-Bucket + CloudFront (Preview) | ein Build je Pull Request unter `https://<id>.cloudfront.net/pr-<n>/`, nach 30 Tagen ohne Push gelöscht |
| CloudFront Function `spa-fallback.js` | `/game/<seed>`, `/galerie` → `index.html` (200), fehlende Dateien → 404 |
| Budget | Mail, wenn das AWS-Konto im Monat über 5 $ kostet oder laut Prognose kosten wird |
| OIDC-Rolle `soliva-github-deploy` | GitHub Actions auf `main` darf in beide Buckets schreiben, sonst nichts |

Den Deploy des Spiels machen die Workflows: `deploy-aws.yml` baut bei jedem Push auf `main` und lädt
hoch (`tools/deploy/s3-upload.sh`), bei einem PR baut es nur. `preview-aws.yml` lädt den PR-Build als
Preview hoch und schreibt den Link in den PR. `preview-aws.yml` läuft erst, wenn es auf `main` liegt.
`bun run deploy` von Hand braucht es nur, wenn sich `infra/` ändert.

Abgerechnet wird nach Verbrauch: CloudFront ist bis 1 TB und 10 Mio. Anfragen im Monat dauerhaft
gratis, S3 kostet bei dieser Größe Cent-Beträge. Einen Kostendeckel gibt es nicht, nur den Budget-Alarm.
Den Deckel hätte der CloudFront-Flat-Rate-Plan (Free 0 $ mit 100 GB, Pro 15 $ mit 50 TB); er verlangt
eine WAF an der Distribution und wird in der Konsole gebucht. Amplify (0,15 $/GB, kein Git LFS im Build)
und Lightsail (kein Brotli) wurden verworfen. DNS bleibt bei GoDaddy, Route 53 wird nicht genutzt.

## Einstellungen: `infra/.env.local`

Gitignored, Vorlage und Erklärung in `.env.example` im Repo:

```bash
AWS_PROFILE=<profil aus ~/.aws/config>
BUDGET_EMAILS=a@example.org,b@example.org
# nur wenn es im Konto schon einen OIDC-Anbieter für GitHub gibt:
# GITHUB_OIDC_PROVIDER_ARN=arn:aws:iam::<konto>:oidc-provider/token.actions.githubusercontent.com
```

Die Mail-Adressen stehen nicht im Repo, weil es öffentlich ist. `bun run deploy` und die anderen
Skripte lesen die Datei selbst (`bun --env-file=.env.local`).

## Erster Deploy

Braucht: ein AWS-Profil mit Admin-Rechten im Zielkonto, bun, Zugang zum DNS von `mannseicher.com`
(GoDaddy) und Admin-Rechte im GitHub-Repo `Mansi1/Soliva`.

1. `AWS_PROFILE` in `infra/.env.local` eintragen und anmelden, falls das Profil SSO nutzt:
   `aws sso login --profile <profil>`. Prüfen: `aws sts get-caller-identity --profile <profil>` zeigt das
   richtige Konto.
2. Prüfen, ob es den OIDC-Anbieter für GitHub schon gibt:
   `aws iam list-open-id-connect-providers --profile <profil>`. Steht dort
   `…/token.actions.githubusercontent.com`, die ARN als `GITHUB_OIDC_PROVIDER_ARN` eintragen.
3. ```bash
   cd infra
   bun install
   bun run bootstrap   # einmal je Konto, für eu-central-1 und us-east-1
   bun run diff        # zeigt, was angelegt wird
   bun run deploy      # beide Stacks; fragt nach Bestätigung der IAM-Änderungen
   ```
4. Während `deploy` beim Zertifikat wartet (Stack `SolivaCertificate`): In der ACM-Konsole, Region
   **us-east-1**, das Zertifikat für
   `game.mannseicher.com` öffnen und den angezeigten CNAME bei GoDaddy anlegen (Name ohne
   `.mannseicher.com` am Ende). Sobald ACM ihn sieht, läuft der Deploy weiter. Am Spiel ändert der
   Eintrag nichts.
5. Am Ende stehen die Outputs da: `ProdDomain` (`dxxxx.cloudfront.net`), `PreviewDomain` und die Buckets.
6. Die Konto-ID für die Workflows setzen:
   `gh variable set AWS_ACCOUNT_ID --repo Mansi1/Soliva --body <konto-id>`.
7. Den PR mergen. Der Push auf `main` startet `deploy-aws` und lädt das Spiel hoch. Dann auf der
   CloudFront-Adresse prüfen:
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
2. Den CNAME `game` von `…vercel-dns-017.com` auf `ProdDomain` umstellen. Vercel liefert weiter aus,
   bis die alte TTL abgelaufen ist - kein Ausfall.
3. Prüfen: `curl -sI https://game.mannseicher.com/ | grep -iE 'server|x-cache'` zeigt CloudFront.
4. Ein bis zwei Wochen beobachten (CloudFront-Konsole: Anfragen, 4xx/5xx), dann das Vercel-Projekt
   von der Domain trennen und löschen. Die TTL wieder hochsetzen.

## Grenzen

- CloudFront komprimiert nur Dateien bis 10.000.000 Byte. Größere (heute `world-*.js`) lädt
  `s3-upload.sh` schon mit Brotli kodiert hoch. Wird das Bundle aufgeteilt, entfällt das.
- Alte Assets bleiben im Prod-Bucket liegen, weil offene Tabs nach einem Deploy noch alte Chunks nachladen.
  ponytail: nichts räumt sie ab; ein Aufräumen (alles, was in den letzten Builds nicht mehr vorkam)
  bauen, wenn der Bucket über ein paar GB wächst.
- Der Budget-Alarm zählt das ganze AWS-Konto, nicht nur Soliva.
