<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Email_Expiry_Reminder extends WC_Email {
  public function __construct() {
    $this->id = 'ssdtf_expiry_reminder';
    $this->customer_email = true;
    $this->title = __('Gang sheet expiry reminder', 'ssdtf-rewards');
    $this->description = __('Sent when a reorderable gang sheet is near its hold expiry.', 'ssdtf-rewards');
    $this->template_html = 'emails/ssdtf-expiry-reminder.php';
    $this->template_plain = 'emails/plain/ssdtf-expiry-reminder.php';
    $this->template_base = SSDTF_REWARDS_DIR . 'templates/';
    $this->placeholders = array(
      '{filename}' => '',
      '{days}' => '',
    );
    parent::__construct();
    $this->recipient = '';
  }

  public function get_default_subject() {
    $days = SSDTF_Rewards_Settings::get_int('ssdtf_reminder_days');
    return sprintf(__('Your gang sheet expires in %d days', 'ssdtf-rewards'), $days);
  }

  public function get_default_heading() {
    return __('Your gang sheet is expiring soon', 'ssdtf-rewards');
  }

  public function trigger($file_row) {
    if (!$file_row || empty($file_row['user_id'])) {
      return false;
    }
    $user = get_user_by('id', intval($file_row['user_id']));
    if (!$user) {
      return false;
    }
    $this->object = $file_row;
    $this->recipient = $user->user_email;
    $this->placeholders['{filename}'] = $file_row['filename'];
    $this->placeholders['{days}'] = (string) SSDTF_Rewards_Settings::get_int('ssdtf_reminder_days');

    if (!$this->is_enabled() || !$this->get_recipient()) {
      return false;
    }
    return $this->send($this->get_recipient(), $this->get_subject(), $this->get_content(), $this->get_headers(), $this->get_attachments());
  }

  public function get_content_html() {
    $row = $this->object;
    $user_id = intval($row['user_id']);
    $thumb = SSDTF_Rewards_Relay::thumb_url($row['drive_file_id'], $user_id);
    $order_url = wc_get_endpoint_url('view-order', $row['last_order_id'], wc_get_page_permalink('myaccount'));
    ob_start();
    echo '<p>' . esc_html(sprintf(__('Your gang sheet “%s” expires soon.', 'ssdtf-rewards'), $row['filename'])) . '</p>';
    if ($thumb) {
      echo '<p><img src="' . esc_url($thumb) . '" alt="" width="160" /></p>';
    }
    echo '<p><a href="' . esc_url($order_url) . '">' . esc_html__('Reorder now', 'ssdtf-rewards') . '</a></p>';
    return ob_get_clean();
  }

  public function get_content_plain() {
    $row = $this->object;
    $order_url = wc_get_endpoint_url('view-order', $row['last_order_id'], wc_get_page_permalink('myaccount'));
    return sprintf(
      "%s\n%s\n%s\n",
      sprintf(__('Your gang sheet “%s” expires soon.', 'ssdtf-rewards'), $row['filename']),
      __('Reorder now:', 'ssdtf-rewards'),
      $order_url
    );
  }
}
