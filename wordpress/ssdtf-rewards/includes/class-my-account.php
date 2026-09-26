<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Rewards_My_Account {
  public static function init() {
    add_action('init', array(__CLASS__, 'endpoint'));
    add_filter('woocommerce_account_menu_items', array(__CLASS__, 'menu'));
    add_action('woocommerce_account_rewards_endpoint', array(__CLASS__, 'render'));
    add_action('woocommerce_before_checkout_form', array(__CLASS__, 'guest_teaser'), 4);
    add_action('woocommerce_review_order_before_payment', array(__CLASS__, 'guest_teaser_checkout'));
  }

  public static function endpoint() {
    add_rewrite_endpoint('rewards', EP_ROOT | EP_PAGES);
  }

  public static function menu($items) {
    $new = array();
    foreach ($items as $key => $label) {
      $new[$key] = $label;
      if ($key === 'orders') {
        $new['rewards'] = __('Rewards', 'ssdtf-rewards');
      }
    }
    if (!isset($new['rewards'])) {
      $new['rewards'] = __('Rewards', 'ssdtf-rewards');
    }
    return $new;
  }

  public static function render() {
    if (!is_user_logged_in()) {
      echo '<p>' . esc_html__('Please log in to view rewards.', 'ssdtf-rewards') . '</p>';
      return;
    }
    $user_id = get_current_user_id();
    $balance = SSDTF_Rewards_Points::balance($user_id);
    $value = SSDTF_Rewards_Points::dollar_value_of_points($balance);
    $block_pts = SSDTF_Rewards_Settings::get_int('ssdtf_redeem_points');
    $block_val = SSDTF_Rewards_Settings::get_float('ssdtf_redeem_value');
    $into_next = $block_pts > 0 ? ($balance % $block_pts) : 0;
    $need = max(0, $block_pts - $into_next);
    if ($into_next === 0 && $balance > 0) {
      $need = $block_pts;
    }
    if ($balance === 0) {
      $need = $block_pts;
    }

    echo '<div class="ssdtf-rewards-tab">';
    printf(
      '<p style="font-size:1.5em;"><strong>%d %s = %s</strong></p>',
      $balance,
      esc_html__('points', 'ssdtf-rewards'),
      wp_kses_post(wc_price($value))
    );
    printf(
      '<p>%s</p>',
      esc_html(sprintf(
        /* translators: 1: points needed 2: dollar value */
        __('%1$d more points until your next %2$s', 'ssdtf-rewards'),
        $need,
        wp_strip_all_tags(wc_price($block_val))
      ))
    );

    $page = max(1, intval($_GET['ssdtf_ledger_page'] ?? 1));
    $ledger = SSDTF_Rewards_Points::ledger_page($user_id, $page, 20);
    echo '<table class="shop_table"><thead><tr>';
    echo '<th>' . esc_html__('Date', 'ssdtf-rewards') . '</th>';
    echo '<th>' . esc_html__('Description', 'ssdtf-rewards') . '</th>';
    echo '<th>' . esc_html__('Points', 'ssdtf-rewards') . '</th>';
    echo '</tr></thead><tbody>';
    if (empty($ledger['rows'])) {
      echo '<tr><td colspan="3">' . esc_html__('No points activity yet.', 'ssdtf-rewards') . '</td></tr>';
    }
    foreach ($ledger['rows'] as $row) {
      $local = get_date_from_gmt($row['created_at'], get_option('date_format') . ' ' . get_option('time_format'));
      $pts = intval($row['points']);
      echo '<tr>';
      echo '<td>' . esc_html($local) . '</td>';
      echo '<td>' . esc_html($row['note']) . '</td>';
      echo '<td>' . esc_html(($pts > 0 ? '+' : '') . $pts) . '</td>';
      echo '</tr>';
    }
    echo '</tbody></table>';

    $pages = max(1, (int) ceil($ledger['total'] / 20));
    if ($pages > 1) {
      echo '<p>';
      for ($i = 1; $i <= $pages; $i++) {
        $url = esc_url(add_query_arg('ssdtf_ledger_page', $i));
        echo '<a href="' . $url . '"' . ($i === $page ? ' style="font-weight:bold"' : '') . '>' . intval($i) . '</a> ';
      }
      echo '</p>';
    }

    $earn = SSDTF_Rewards_Settings::get_float('ssdtf_earn_rate');
    $max_pct = SSDTF_Rewards_Settings::get_float('ssdtf_redeem_max_pct');
    $hold = SSDTF_Rewards_Settings::get_int('ssdtf_file_hold_days');
    printf(
      '<p class="ssdtf-rewards-rules">%s</p>',
      esc_html(sprintf(
        __('Earn %1$s point(s) per $1 (after discounts). Redeem %2$d points for %3$s, up to %4$s%% of your cart. Gang sheet files stay reorderable for %5$d days.', 'ssdtf-rewards'),
        rtrim(rtrim(number_format($earn, 2, '.', ''), '0'), '.'),
        $block_pts,
        wp_strip_all_tags(wc_price($block_val)),
        rtrim(rtrim(number_format($max_pct, 2, '.', ''), '0'), '.'),
        $hold
      ))
    );
    echo '</div>';
  }

  public static function guest_teaser() {
    if (is_user_logged_in() || !SSDTF_Rewards_Settings::get_bool('ssdtf_points_enabled') || !WC()->cart) {
      return;
    }
    $eligible = max(0, floatval(WC()->cart->get_subtotal()) - floatval(WC()->cart->get_discount_total()));
    $points = SSDTF_Rewards_Points::points_for_eligible($eligible);
    if ($points <= 0) {
      return;
    }
    printf(
      '<div class="woocommerce-info">%s</div>',
      esc_html(sprintf(
        __('Create an account to earn %d points on this order and reorder your gang sheets for 60 days.', 'ssdtf-rewards'),
        $points
      ))
    );
  }

  public static function guest_teaser_checkout() {
    // Avoid double-printing if already shown above form.
    if (did_action('woocommerce_before_checkout_form') > 0) {
      return;
    }
    self::guest_teaser();
  }
}
