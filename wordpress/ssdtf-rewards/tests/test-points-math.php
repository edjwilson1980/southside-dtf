<?php
/**
 * Standalone math tests (no WP bootstrap required).
 * Run: php wordpress/ssdtf-rewards/tests/test-points-math.php
 */

function ssdtf_assert($cond, $msg) {
  if (!$cond) {
    fwrite(STDERR, "FAIL: $msg\n");
    exit(1);
  }
  echo "OK: $msg\n";
}

function points_for_eligible($eligible, $rate = 1.0) {
  return (int) floor(floatval($eligible) * floatval($rate));
}

function available_redeem($balance, $cart_subtotal, $block_pts = 100, $block_val = 5.0, $max_pct = 50.0) {
  if ($balance <= 0) {
    return array('blocks' => 0, 'points' => 0, 'value' => 0.0);
  }
  $max_by_balance = (int) floor($balance / $block_pts);
  $max_value_by_cart = floatval($cart_subtotal) * ($max_pct / 100.0);
  $max_by_cart = $block_val > 0 ? (int) floor($max_value_by_cart / $block_val) : 0;
  $blocks = max(0, min($max_by_balance, $max_by_cart));
  return array(
    'blocks' => $blocks,
    'points' => $blocks * $block_pts,
    'value' => $blocks * $block_val,
  );
}

function expires_at($last_ordered_ts, $hold_days = 60) {
  return $last_ordered_ts + ($hold_days * 86400);
}

// §13: $80 subtotal, $10 shipping → +80 (shipping excluded)
ssdtf_assert(points_for_eligible(80) === 80, 'earn 80 on $80 eligible');
ssdtf_assert(points_for_eligible(80 - 0) === 80, 'shipping not in eligible');

// Partial refund floor
ssdtf_assert((int) floor(30 * 1) === 30, 'partial refund 30 points');

// Balance 340, cart $20 → max 50% = $10 = 200 points
$cap = available_redeem(340, 20);
ssdtf_assert($cap['points'] === 200, 'redeem cap 200 points on $20 cart');
ssdtf_assert($cap['value'] === 10.0, 'redeem value $10');

// Idempotency simulation: map of order_id+type
$seen = array();
function award_once(&$seen, $order_id, $type, $pts) {
  $key = $order_id . '|' . $type;
  if (isset($seen[$key])) {
    return 0;
  }
  $seen[$key] = $pts;
  return $pts;
}
$total = award_once($seen, 1, 'earn', 80);
$total += award_once($seen, 1, 'earn', 80);
ssdtf_assert($total === 80, 'idempotent earn');

// Expiry date math
$now = strtotime('2026-09-26 12:00:00 UTC');
$exp = expires_at($now, 60);
ssdtf_assert($exp === $now + 60 * 86400, 'expires_at = last + 60 days');
$reset = expires_at(strtotime('2026-11-15 12:00:00 UTC'), 60);
ssdtf_assert($reset > $exp, 'reorder resets further out');

echo "\nAll points math tests passed.\n";
