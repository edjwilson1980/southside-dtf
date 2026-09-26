<?php
/**
 * Unit checks for Upload Gangsheet size helpers.
 * Run: php wordpress/southside-gangsheet/tests/test-upload-sizes.php
 */

function ssdtf_length_from_slug($slug) {
  if (!is_string($slug) || $slug === '') {
    return 0;
  }
  if (preg_match('/x-?(\d+)/i', $slug, $m)) {
    return intval($m[1]);
  }
  return 0;
}

function ssdtf_assert($cond, $msg) {
  if (!$cond) {
    fwrite(STDERR, "FAIL: $msg\n");
    exit(1);
  }
  echo "ok: $msg\n";
}

$slugs = array(
  '22-in-x-12-in-1ft' => 12,
  '22-in-x-24-in-2ft' => 24,
  '22-in-x-36-in-3ft' => 36,
  '22-in-x-48-in-4ft' => 48,
  '22-in-x-60-in-5ft' => 60,
  '22-in-x-72in-6ft' => 72,
  '22-in-x-120in-10ft' => 120,
  '22-x150-in-12ft' => 150,
  '22-x200-16ft' => 200,
);

foreach ($slugs as $slug => $len) {
  ssdtf_assert(ssdtf_length_from_slug($slug) === $len, "lengthFromSlug($slug) === $len");
}

function ssdtf_test_pick($length, $map) {
  if ($length < 12) {
    $length = 12;
  }
  if ($length > 200 + 1e-9) {
    return null;
  }
  foreach ($map as $row) {
    if ($row['length_in'] + 1e-9 >= $length) {
      return $row;
    }
  }
  return null;
}

$map = array();
foreach (array(12, 24, 36, 48, 60, 72, 120, 150, 200) as $n) {
  $map[] = array('length_in' => $n, 'variation_id' => $n);
}

ssdtf_assert(ssdtf_test_pick(12, $map)['length_in'] === 12, 'exactly 12 → 12');
ssdtf_assert(ssdtf_test_pick(12.01, $map)['length_in'] === 24, '12.01 → 24');
ssdtf_assert(ssdtf_test_pick(11.5, $map)['length_in'] === 12, 'under 12 → 12');
ssdtf_assert(ssdtf_test_pick(200, $map)['length_in'] === 200, 'exactly 200 → 200');
ssdtf_assert(ssdtf_test_pick(200.01, $map) === null, '200.01 → reject');
ssdtf_assert(ssdtf_test_pick(48, $map)['length_in'] === 48, 'exactly 48 → 48');
ssdtf_assert(ssdtf_test_pick(48.1, $map)['length_in'] === 60, '48.1 → 60');

echo "All upload size tests passed.\n";
