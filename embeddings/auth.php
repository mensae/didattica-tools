<?php
declare(strict_types=1);

// Segreti (hash della password e salt del cookie): stanno in auth.local.php,
// che non è nel repository. Vedi auth.local.example.php.
$authLocalPath = __DIR__ . '/auth.local.php';
if (!is_file($authLocalPath)) {
  http_response_code(500);
  exit('Missing auth.local.php');
}

require_once $authLocalPath;

const AUTH_COOKIE_NAME = 'vectors_auth';
const AUTH_COOKIE_TTL = 2592000;
const AUTH_COOKIE_SAMESITE = 'Lax';

// Dopo LOGIN_MAX_FAILURES password sbagliate entro LOGIN_WINDOW secondi,
// lo stesso IP non può più provare finché la finestra non scade.
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW = 900;

function cookie_path(): string
{
  $scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/index.php');
  $directory = rtrim(dirname($scriptName), '/');

  if ($directory === '' || $directory === '.') {
    return '/';
  }

  return $directory . '/';
}

function use_secure_cookie(): bool
{
  return !empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off';
}

function auth_cookie_value(): string
{
  return hash('sha256', LOGIN_PASSWORD_HASH . '|' . AUTH_COOKIE_SALT);
}

function set_cookie_compat(string $name, string $value, int $expires)
{
  $path = cookie_path();
  $secure = use_secure_cookie();

  if (PHP_VERSION_ID >= 70300) {
    setcookie($name, $value, [
      'expires' => $expires,
      'path' => $path,
      'httponly' => true,
      'samesite' => AUTH_COOKIE_SAMESITE,
      'secure' => $secure,
    ]);
    return;
  }

  setcookie(
    $name,
    $value,
    $expires,
    $path . '; samesite=' . AUTH_COOKIE_SAMESITE,
    '',
    $secure,
    true
  );
}

function has_valid_auth_cookie(): bool
{
  $cookie = $_COOKIE[AUTH_COOKIE_NAME] ?? '';

  return is_string($cookie)
    && $cookie !== ''
    && hash_equals(auth_cookie_value(), $cookie);
}

function set_auth_cookie()
{
  $cookieValue = auth_cookie_value();
  set_cookie_compat(AUTH_COOKIE_NAME, $cookieValue, time() + AUTH_COOKIE_TTL);
  $_COOKIE[AUTH_COOKIE_NAME] = $cookieValue;
}

function clear_auth_cookie()
{
  set_cookie_compat(AUTH_COOKIE_NAME, '', time() - 3600);
  unset($_COOKIE[AUTH_COOKIE_NAME]);
}
function verify_login_password(string $password): bool
{
  return LOGIN_PASSWORD_HASH !== '' && password_verify($password, LOGIN_PASSWORD_HASH);
}

function login_attempts_file(): string
{
  $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');

  return sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'vectors_login_' . hash('sha256', $ip . '|' . AUTH_COOKIE_SALT) . '.json';
}

function recent_login_failures(): array
{
  $raw = @file_get_contents(login_attempts_file());
  $failures = is_string($raw) ? json_decode($raw, true) : null;
  if (!is_array($failures)) {
    return [];
  }

  $cutoff = time() - LOGIN_WINDOW;

  return array_values(array_filter($failures, static function ($timestamp) use ($cutoff): bool {
    return is_int($timestamp) && $timestamp > $cutoff;
  }));
}

function is_login_locked(): bool
{
  return count(recent_login_failures()) >= LOGIN_MAX_FAILURES;
}

function record_login_failure()
{
  $failures = recent_login_failures();
  $failures[] = time();
  @file_put_contents(login_attempts_file(), json_encode($failures), LOCK_EX);
}

function clear_login_failures()
{
  @unlink(login_attempts_file());
}
