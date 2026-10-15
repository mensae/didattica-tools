<?php
declare(strict_types=1);

const DATA_DIRECTORY_NAME = 'data';
const DATASET_SAVE_ACTION = 'save-dataset';
const DATASET_DELETE_ACTION = 'delete-dataset';
const DATASET_RENAME_ACTION = 'rename-dataset';

require_once __DIR__ . '/auth.php';

function current_request_uri(): string
{
  $requestUri = $_SERVER['REQUEST_URI'] ?? '/';
  return is_string($requestUri) && $requestUri !== '' ? $requestUri : '/';
}

function current_request_uri_without_logout(): string
{
  $requestUri = current_request_uri();
  $parts = parse_url($requestUri);
  $path = $parts['path'] ?? '/';

  $queryParams = [];
  if (!empty($parts['query'])) {
    parse_str((string) $parts['query'], $queryParams);
    unset($queryParams['logout']);
    unset($queryParams['guest']);
  }

  $queryString = http_build_query($queryParams);

  return $queryString !== '' ? $path . '?' . $queryString : $path;
}

function current_request_uri_with_guest(): string
{
  $requestUri = current_request_uri();
  $parts = parse_url($requestUri);
  $path = $parts['path'] ?? '/';

  $queryParams = [];
  if (!empty($parts['query'])) {
    parse_str((string) $parts['query'], $queryParams);
    unset($queryParams['logout']);
  }

  $queryParams['guest'] = '1';
  $queryString = http_build_query($queryParams);

  return $queryString !== '' ? $path . '?' . $queryString : $path;
}

function is_guest_mode_requested(): bool
{
  $guestParam = $_GET['guest'] ?? '';

  return is_string($guestParam)
    && ($guestParam === '1' || strtolower($guestParam) === 'true');
}

function send_json_response(array $payload, int $statusCode = 200)
{
  http_response_code($statusCode);
  header('Content-Type: application/json; charset=utf-8');

  $encodedPayload = json_encode($payload, JSON_UNESCAPED_SLASHES);
  if ($encodedPayload === false) {
    echo '{"error":"Response encoding failed."}';
  } else {
    echo $encodedPayload;
  }

  exit;
}

function data_directory_path(): string
{
  return __DIR__ . DIRECTORY_SEPARATOR . DATA_DIRECTORY_NAME;
}

function manifest_file_path(): string
{
  return data_directory_path() . DIRECTORY_SEPARATOR . 'manifest.json';
}

function is_list_array(array $value): bool
{
  $expectedIndex = 0;
  foreach ($value as $key => $_) {
    if ($key !== $expectedIndex++) {
      return false;
    }
  }

  return true;
}

function normalize_dataset_filename(string $datasetName): string
{
  $trimmedName = trim($datasetName);
  if ($trimmedName === '') {
    throw new RuntimeException('Dataset name is required.');
  }

  if (strtolower(substr($trimmedName, -5)) === '.json') {
    $trimmedName = substr($trimmedName, 0, -5);
  }

  $normalizedName = preg_replace('/[^A-Za-z0-9_-]+/', '-', $trimmedName) ?? '';
  $normalizedName = trim($normalizedName, '-_');

  if ($normalizedName === '') {
    throw new RuntimeException('Dataset name must include letters or numbers.');
  }

  return $normalizedName . '.json';
}

function dataset_filename_from_path(string $datasetPath): string
{
  $normalizedPath = str_replace('\\', '/', trim($datasetPath));
  if (strpos($normalizedPath, DATA_DIRECTORY_NAME . '/') !== 0) {
    throw new RuntimeException('Only datasets inside data/ can be overwritten.');
  }

  $filename = basename($normalizedPath);
  if ($filename === '' || strtolower($filename) === 'manifest.json' || !preg_match('/^[A-Za-z0-9._-]+\.json$/', $filename)) {
    throw new RuntimeException('Invalid dataset path.');
  }

  return $filename;
}

function ensure_data_directory_exists()
{
  $dataDirectory = data_directory_path();
  if (is_dir($dataDirectory)) {
    return;
  }

  if (!mkdir($dataDirectory, 0775, true) && !is_dir($dataDirectory)) {
    throw new RuntimeException('Could not create the data directory.');
  }
}

function manifest_entries(): array
{
  $manifestPath = manifest_file_path();
  if (!is_file($manifestPath)) {
    return [];
  }

  $rawManifest = file_get_contents($manifestPath);
  if (!is_string($rawManifest) || trim($rawManifest) === '') {
    return [];
  }

  $decodedManifest = json_decode($rawManifest, true);
  if (is_array($decodedManifest) && is_list_array($decodedManifest)) {
    return $decodedManifest;
  }
  if (is_array($decodedManifest) && isset($decodedManifest['files']) && is_array($decodedManifest['files'])) {
    return $decodedManifest['files'];
  }

  return [];
}

function update_dataset_manifest(string $filename)
{
  $entries = manifest_entries();
  $entries[] = $filename;
  $entries = array_values(array_unique(array_filter($entries, static function ($entry): bool {
    return is_string($entry) && preg_match('/^[A-Za-z0-9._-]+\.json$/', $entry) === 1 && strtolower($entry) !== 'manifest.json';
  })));

  write_manifest_entries($entries);
}

function write_manifest_entries(array $entries)
{
  $entries = array_values(array_unique(array_filter($entries, static function ($entry): bool {
    return is_string($entry) && preg_match('/^[A-Za-z0-9._-]+\.json$/', $entry) === 1 && strtolower($entry) !== 'manifest.json';
  })));

  natcasesort($entries);
  $payload = json_encode(['files' => array_values($entries)], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  if ($payload === false) {
    throw new RuntimeException('Could not encode the manifest file.');
  }

  $result = file_put_contents(manifest_file_path(), $payload . PHP_EOL, LOCK_EX);
  if ($result === false) {
    throw new RuntimeException('Could not update the dataset manifest.');
  }
}

function remove_dataset_from_manifest(string $filename)
{
  $entries = array_values(array_filter(manifest_entries(), static function ($entry) use ($filename): bool {
    return $entry !== $filename;
  }));

  write_manifest_entries($entries);
}

function rename_dataset_in_manifest(string $fromFilename, string $toFilename)
{
  $entries = manifest_entries();
  $wasReplaced = false;

  $entries = array_map(static function ($entry) use ($fromFilename, $toFilename, &$wasReplaced) {
    if ($entry === $fromFilename) {
      $wasReplaced = true;
      return $toFilename;
    }

    return $entry;
  }, $entries);

  if (!$wasReplaced) {
    $entries[] = $toFilename;
  }

  write_manifest_entries($entries);
}

function handle_save_dataset_request()
{
  if (!has_valid_auth_cookie()) {
    send_json_response(['error' => 'Unauthorized.'], 401);
  }

  if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    send_json_response(['error' => 'Method not allowed.'], 405);
  }

  $rawPayload = file_get_contents('php://input');
  $decodedPayload = json_decode(is_string($rawPayload) ? $rawPayload : '', true);
  if (!is_array($decodedPayload)) {
    send_json_response(['error' => 'Invalid save payload.'], 400);
  }

  $datasetData = $decodedPayload['datasetData'] ?? null;
  if (!is_array($datasetData)) {
    send_json_response(['error' => 'Dataset data is required.'], 400);
  }

  $datasetPath = isset($decodedPayload['datasetPath']) ? (string) $decodedPayload['datasetPath'] : '';
  $datasetName = isset($decodedPayload['datasetName']) ? (string) $decodedPayload['datasetName'] : '';
  $overwrite = !empty($decodedPayload['overwrite']);

  try {
    $filename = $datasetName !== ''
      ? normalize_dataset_filename($datasetName)
      : dataset_filename_from_path($datasetPath);

    ensure_data_directory_exists();

    $targetPath = data_directory_path() . DIRECTORY_SEPARATOR . $filename;
    $alreadyExists = is_file($targetPath);
    if ($alreadyExists && !$overwrite) {
      send_json_response([
        'error' => 'Dataset already exists.',
        'code' => 'dataset_exists',
        'datasetPath' => DATA_DIRECTORY_NAME . '/' . $filename,
      ], 409);
    }

    $encodedDataset = json_encode($datasetData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($encodedDataset === false) {
      throw new RuntimeException('Could not encode the dataset JSON.');
    }

    $writeResult = file_put_contents($targetPath, $encodedDataset . PHP_EOL, LOCK_EX);
    if ($writeResult === false) {
      throw new RuntimeException('Could not write the dataset file.');
    }

    update_dataset_manifest($filename);

    send_json_response([
      'ok' => true,
      'datasetPath' => DATA_DIRECTORY_NAME . '/' . $filename,
      'filename' => $filename,
    ], $alreadyExists ? 200 : 201);
  } catch (RuntimeException $exception) {
    send_json_response(['error' => $exception->getMessage()], 400);
  }
}

function handle_delete_dataset_request()
{
  if (!has_valid_auth_cookie()) {
    send_json_response(['error' => 'Unauthorized.'], 401);
  }

  if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    send_json_response(['error' => 'Method not allowed.'], 405);
  }

  $rawPayload = file_get_contents('php://input');
  $decodedPayload = json_decode(is_string($rawPayload) ? $rawPayload : '', true);
  if (!is_array($decodedPayload)) {
    send_json_response(['error' => 'Invalid delete payload.'], 400);
  }

  $datasetPath = isset($decodedPayload['datasetPath']) ? (string) $decodedPayload['datasetPath'] : '';
  if ($datasetPath === '') {
    send_json_response(['error' => 'Dataset path is required.'], 400);
  }

  try {
    $filename = dataset_filename_from_path($datasetPath);
    $targetPath = data_directory_path() . DIRECTORY_SEPARATOR . $filename;
    if (!is_file($targetPath)) {
      send_json_response(['error' => 'Dataset not found.'], 404);
    }

    if (!unlink($targetPath)) {
      throw new RuntimeException('Could not delete the dataset file.');
    }

    remove_dataset_from_manifest($filename);

    send_json_response([
      'ok' => true,
      'datasetPath' => DATA_DIRECTORY_NAME . '/' . $filename,
      'filename' => $filename,
    ]);
  } catch (RuntimeException $exception) {
    send_json_response(['error' => $exception->getMessage()], 400);
  }
}

function handle_rename_dataset_request()
{
  if (!has_valid_auth_cookie()) {
    send_json_response(['error' => 'Unauthorized.'], 401);
  }

  if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    send_json_response(['error' => 'Method not allowed.'], 405);
  }

  $rawPayload = file_get_contents('php://input');
  $decodedPayload = json_decode(is_string($rawPayload) ? $rawPayload : '', true);
  if (!is_array($decodedPayload)) {
    send_json_response(['error' => 'Invalid rename payload.'], 400);
  }

  $datasetPath = isset($decodedPayload['datasetPath']) ? (string) $decodedPayload['datasetPath'] : '';
  $datasetName = isset($decodedPayload['datasetName']) ? (string) $decodedPayload['datasetName'] : '';

  if ($datasetPath === '') {
    send_json_response(['error' => 'Dataset path is required.'], 400);
  }

  try {
    $sourceFilename = dataset_filename_from_path($datasetPath);
    $targetFilename = normalize_dataset_filename($datasetName);
    $sourcePath = data_directory_path() . DIRECTORY_SEPARATOR . $sourceFilename;
    $targetPath = data_directory_path() . DIRECTORY_SEPARATOR . $targetFilename;

    if (!is_file($sourcePath)) {
      send_json_response(['error' => 'Dataset not found.'], 404);
    }

    if ($sourceFilename === $targetFilename) {
      update_dataset_manifest($targetFilename);

      send_json_response([
        'ok' => true,
        'datasetPath' => DATA_DIRECTORY_NAME . '/' . $targetFilename,
        'filename' => $targetFilename,
        'renamed' => false,
      ]);
    }

    if (is_file($targetPath)) {
      send_json_response([
        'error' => 'Dataset already exists.',
        'code' => 'dataset_exists',
        'datasetPath' => DATA_DIRECTORY_NAME . '/' . $targetFilename,
      ], 409);
    }

    if (!rename($sourcePath, $targetPath)) {
      throw new RuntimeException('Could not rename the dataset file.');
    }

    rename_dataset_in_manifest($sourceFilename, $targetFilename);

    send_json_response([
      'ok' => true,
      'datasetPath' => DATA_DIRECTORY_NAME . '/' . $targetFilename,
      'filename' => $targetFilename,
      'previousDatasetPath' => DATA_DIRECTORY_NAME . '/' . $sourceFilename,
      'renamed' => true,
    ]);
  } catch (RuntimeException $exception) {
    send_json_response(['error' => $exception->getMessage()], 400);
  }
}

if (isset($_GET['logout'])) {
  clear_auth_cookie();
  header('Location: ' . current_request_uri_without_logout());
  exit;
}

if (($_GET['action'] ?? '') === DATASET_SAVE_ACTION) {
  handle_save_dataset_request();
}

if (($_GET['action'] ?? '') === DATASET_DELETE_ACTION) {
  handle_delete_dataset_request();
}

if (($_GET['action'] ?? '') === DATASET_RENAME_ACTION) {
  handle_rename_dataset_request();
}

$hasValidAuthCookie = has_valid_auth_cookie();
$isGuestMode = !$hasValidAuthCookie && is_guest_mode_requested();

if ($hasValidAuthCookie || $isGuestMode) {
  define('VECTOR_APP_AUTHORIZED', true);
  define('VECTOR_APP_GUEST_MODE', $isGuestMode);
  require __DIR__ . '/app.php';
  exit;
}

$errorMessage = '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
  $submittedPassword = trim((string) ($_POST['password'] ?? ''));

  if (is_login_locked()) {
    http_response_code(429);
    $errorMessage = 'Too many attempts. Try again in a few minutes.';
  } elseif (verify_login_password($submittedPassword)) {
    clear_login_failures();
    set_auth_cookie();
    header('Location: ' . current_request_uri_without_logout());
    exit;
  } else {
    record_login_failure();
    $errorMessage = 'Wrong password.';
  }
}

$formAction = htmlspecialchars(current_request_uri(), ENT_QUOTES, 'UTF-8');
$guestAction = htmlspecialchars(current_request_uri_with_guest(), ENT_QUOTES, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Login</title>
  <style>
    * { box-sizing: border-box; }

    html,
    body {
      margin: 0;
      height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #111118;
      color: #edf1ff;
    }

    body {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }

    .login-card {
      width: min(100%, 320px);
      padding: 24px;
      border: 1px solid #232331;
      border-radius: 12px;
      background: #13131b;
    }

    h1 {
      margin: 0 0 16px;
      font-size: 18px;
      font-weight: 600;
      line-height: 1.2;
      text-align: center;
    }

    .login-error {
      margin-bottom: 12px;
      padding: 9px 11px;
      border: 1px solid rgba(255, 110, 110, 0.28);
      border-radius: 10px;
      background: rgba(115, 19, 19, 0.22);
      color: #ff9a9a;
      font-size: 13px;
      text-align: center;
    }

    input {
      width: 100%;
      padding: 12px 14px;
      margin-bottom: 12px;
      border: 1px solid #333;
      border-radius: 10px;
      background: #1a1a24;
      color: #edf1ff;
      font-size: 15px;
      outline: none;
    }

    input:focus {
      border-color: #556;
    }

    button {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #444;
      border-radius: 10px;
      background: #2a2a3a;
      color: #edf1ff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }

    button:hover {
      background: #3a3a4a;
    }

    .login-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .guest-btn {
      display: block;
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #3a4157;
      border-radius: 10px;
      background: transparent;
      color: #cfd8f4;
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
      transition: background 0.18s, border-color 0.18s, color 0.18s;
    }

    .guest-btn:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: #4d5878;
      color: #eef3ff;
    }
  </style>
</head>
<body>
  <main class="login-card">
    <h1>Insert password</h1>
    <?php if ($errorMessage !== ''): ?>
      <div class="login-error"><?php echo htmlspecialchars($errorMessage, ENT_QUOTES, 'UTF-8'); ?></div>
    <?php endif; ?>
    <form method="post" action="<?php echo $formAction; ?>">
      <input id="password" name="password" type="password" placeholder="Password" autocomplete="current-password" required autofocus />
      <div class="login-actions">
        <button type="submit">Enter</button>
        <a class="guest-btn" href="<?php echo $guestAction; ?>">Continue as guest</a>
      </div>
    </form>
  </main>
</body>
</html>