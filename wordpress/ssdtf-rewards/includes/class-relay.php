<?php
if (!defined('ABSPATH')) {
  exit;
}

class SSDTF_Rewards_Relay {
  public static function sign_body($body) {
    $secret = SSDTF_Rewards_Settings::relay_secret();
    if ($secret === '') {
      return '';
    }
    return hash_hmac('sha256', $body, $secret);
  }

  public static function post($path, array $payload) {
    $base = SSDTF_Rewards_Settings::relay_url();
    $secret = SSDTF_Rewards_Settings::relay_secret();
    if ($base === '' || $secret === '') {
      return new WP_Error('ssdtf_relay', __('Relay URL or secret is not configured.', 'ssdtf-rewards'));
    }
    $payload['ts'] = time();
    $body = wp_json_encode($payload);
    $sig = self::sign_body($body);
    $res = wp_remote_post($base . $path, array(
      'timeout' => 45,
      'headers' => array(
        'Content-Type' => 'application/json',
        'X-SSGS-Signature' => $sig,
      ),
      'body' => $body,
    ));
    if (is_wp_error($res)) {
      return $res;
    }
    $code = wp_remote_retrieve_response_code($res);
    $json = json_decode(wp_remote_retrieve_body($res), true);
    if ($code < 200 || $code >= 300) {
      $msg = is_array($json) && !empty($json['error']) ? $json['error'] : ('HTTP ' . $code);
      return new WP_Error('ssdtf_relay', $msg, array('status' => $code));
    }
    return $json;
  }

  /** PHP-side thumbnail token (drive_file_id|user_id|exp). */
  public static function thumb_token($drive_file_id, $user_id, $ttl = 900) {
    $secret = SSDTF_Rewards_Settings::relay_secret();
    if ($secret === '') {
      return '';
    }
    $exp = time() + intval($ttl);
    $payload = $drive_file_id . '|' . intval($user_id) . '|' . $exp;
    $sig = hash_hmac('sha256', $payload, $secret);
    return rtrim(strtr(base64_encode($payload . '|' . $sig), '+/', '-_'), '=');
  }

  public static function thumb_url($drive_file_id, $user_id) {
    $token = self::thumb_token($drive_file_id, $user_id);
    if ($token === '') {
      return '';
    }
    return SSDTF_Rewards_Settings::relay_url() . '/api/files/thumb?t=' . rawurlencode($token);
  }
}
