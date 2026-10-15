# Lezioni interattive

Pagine HTML autonome, una per argomento, più `index.html` che le collega.

Ogni push su `main` pubblica il sito sul server tramite il workflow `.github/workflows/deploy.yml`.
Servono quattro secrets nel repository (Settings → Secrets and variables → Actions):

- `FTP_SERVER`: host FTP (es. `ftp.tuodominio.it`)
- `FTP_USERNAME`: utente FTP di cPanel
- `FTP_PASSWORD`: password di quell'utente
- `FTP_DIR`: cartella di destinazione, con la `/` finale (es. `public_html/lezioni/`)
