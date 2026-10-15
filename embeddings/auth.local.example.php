<?php
declare(strict_types=1);

// Copia questo file in auth.local.php (che non va committato) e riempi i valori.
//
// Hash della password, da generare con:
//   php -r 'echo password_hash(readline("Password: "), PASSWORD_DEFAULT), PHP_EOL;'
const LOGIN_PASSWORD_HASH = '';

// Stringa casuale lunga, da generare con:
//   php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
const AUTH_COOKIE_SALT = '';
