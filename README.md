# Didattica Tools

Pagine HTML interattive da usare a lezione per spiegare i fondamenti dell'informatica: si esplorano passo per passo, con dati veri o con simulazioni della macchina. Ogni pagina è autonoma (un solo file, nessuna dipendenza da installare) e `index.html` le collega tutte.

Sviluppate da [Enrico Mensa](https://mensae.github.io/), Dipartimento di Informatica, Università di Torino, con l'ausilio di agenti di coding. Hanno scopo didattico e per questo contengono semplificazioni rispetto al funzionamento reale dei sistemi.

## Pagine

- **[Rappresentazione delle informazioni](rappresentazione.html)**: come caratteri, numeri, immagini, video e audio diventano bit, con conversioni tra basi e calcolo dello spazio occupato.
- **[Architettura degli elaboratori](architettura.html)**: CPU e RAM al lavoro sul ciclo di esecuzione di un programma, istruzione per istruzione, più esercizi sui salti condizionali.
- **[Processi e memoria virtuale](processi.html)**: tre programmi che si alternano su una sola CPU, con cambi di contesto, page fault, area di swap e coda del disco.

## Pubblicazione

Ogni push su `main` pubblica il sito via FTP tramite il workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Il workflow usa quattro secrets del repository (Settings → Secrets and variables → Actions):

- `FTP_SERVER`: host FTP
- `FTP_USERNAME`: utente FTP
- `FTP_PASSWORD`: password di quell'utente
- `FTP_DIR`: cartella di destinazione sul server, con la `/` finale
