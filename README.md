# Tools per la Didattica

Strumenti interattivi da usare a lezione per spiegare l'informatica, uno per argomento. Invece di guardare uno schema fermo, si fa avanzare la simulazione un passo alla volta, si cambiano i valori e si vede subito cosa succede. `index.html` raccoglie tutti i tool.

Sviluppati da [Enrico Mensa](https://mensae.github.io/), Dipartimento di Informatica, Università di Torino, con l'ausilio di agenti di coding. Hanno scopo didattico e per questo contengono semplificazioni rispetto al funzionamento reale dei sistemi.

## Introduzione all'Informatica

Pagine HTML autonome, in [`intro-informatica/`](intro-informatica/): ognuna è un solo file e funziona anche aprendola direttamente nel browser.

- **[Rappresentazione delle informazioni](intro-informatica/rappresentazione.html)**: come diventano bit le informazioni che usiamo ogni giorno. Mostra come un testo viene salvato su disco byte per byte, con la tabella ASCII, e converte i numeri tra binario, decimale ed esadecimale. Calcola quanto pesano un'immagine, un file audio e un video, con esempi pronti e con valori scelti da chi la usa.
- **[Architettura degli elaboratori](intro-informatica/architettura.html)**: CPU e RAM eseguono un piccolo programma, un'istruzione alla volta, mentre registri, program counter e memoria si aggiornano a ogni passo. Una seconda parte introduce i salti condizionali, con un esercizio.
- **[Processi e memoria virtuale](intro-informatica/processi.html)**: tre programmi aperti si dividono una sola CPU. Si vede il sistema operativo che salva e ripristina il contesto di ogni processo, gestisce i page fault, sposta pagine tra RAM e area di swap e mette in coda le richieste al disco.

## Altri Tools

- **[Visualizzatore di embedding](embeddings/)**: mostra parole e concetti come vettori in uno spazio 3D, da ruotare ed esplorare, per far vedere che termini con significato simile finiscono vicini. Ha alcuni dataset di esempio (frutti, veicoli e pianeti; una parola ambigua come "pesca"; i vicini di "computer"). I vettori si raggruppano per colore e si possono mostrare come frecce o come punti; i dataset si importano ed esportano in JSON. Chiunque può consultarlo in modalità ospite, mentre per creare, modificare o cancellare i dataset serve una password. È in PHP: per installarlo, copia `embeddings/auth.local.example.php` in `auth.local.php` e riempilo seguendo le istruzioni nel file.
