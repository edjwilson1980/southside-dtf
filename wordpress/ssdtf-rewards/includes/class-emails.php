<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Rewards_Emails {
  public static function init() {
    add_filter('woocommerce_email_classes', array(__CLASS__, 'register_email'));
    add_action('woocommerce_email_after_order_table', array(__CLASS__, 'points_on_completed_email'), 20, 4);
  }

  public static function register_email($emails) {
    require_once SSDTF_REWARDS_DIR . 'includes/class-email-expiry.php';
    $emails['SSDTF_Email_Expiry_Reminder'] = new SSDTF_Email_Expiry_Reminder();
    return $emails;
  }

  public static function send_expiry_reminder(array $file_row) {
    $mailer = WC()->mailer();
    $emails = $mailer->get_emails();
    if (empty($emails['SSDTF_Email_Expiry_Reminder'])) {
      return false;
    }
    /** @var SSDTF_Email_Expiry_Reminder $email */
    $email = $emails['SSDTF_Email_Expiry_Reminder'];
    return $email->trigger($file_row);
  }

  public static function points_on_completed_email($order, $sent_to_admin, $plain_text, $email = null) {
    if ($sent_to_admin || !$order instanceof WC_Order) {
      return;
    }
    if ($email && is_object($email) && isset($email->id) && $email->id !== 'customer_completed_order') {
      return;
    }
    $earned = intval($order->get_meta('_ssdtf_points_earned'));
    $user_id = $order->get_customer_id();
    if ($earned <= 0 || $user_id <= 0) {
      return;
    }
    $balance = SSDTF_Rewards_Points::balance($user_id);
    if ($plain_text) {
      printf("\n" . __('Points earned: %d', 'ssdtf-rewards') . "\n", $earned);
      printf(__('Your balance: %d points', 'ssdtf-rewards') . "\n", $balance);
      return;
    }
    echo '<p><strong>' . esc_html(sprintf(__('Points earned: %d', 'ssdtf-rewards'), $earned)) . '</strong><br />';
    echo esc_html(sprintf(__('Your balance: %d points', 'ssdtf-rewards'), $balance)) . '</p>';
  }
}
