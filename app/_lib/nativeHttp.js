import { CapacitorHttp } from '@capacitor/core';

function read_blob_base64(blob) {
  return new Promise((resolve, reject) => {
    const file_reader = new FileReader();
    file_reader.onload = () => resolve(file_reader.result.split(',')[1]);
    file_reader.onerror = () => reject(file_reader.error);
    file_reader.readAsDataURL(blob);
  });
}

async function send_ios_request(request_url, request_options, { is_upload, timeout_ms, response_type }) {
  const { signal } = request_options;
  const headers = {
    ...request_options.headers,
    // Native HTTP does not add the WebView Origin required by photo uploads.
    Origin: `${window.location.protocol}//${window.location.host}`,
  };
  let request_data = request_options.body;
  if (is_upload) {
    // Let Request serialize the multipart boundary, filenames, and binary bytes.
    const multipart_request = new Request(request_url, request_options);
    headers['Content-Type'] = multipart_request.headers.get('Content-Type');
    request_data = await read_blob_base64(await multipart_request.blob());
  }
  if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
  // URLSession retains HttpOnly cookies for the API host without WebKit's
  // cross-site cookie restrictions. No session token is stored in JavaScript.
  const native_response = await CapacitorHttp.request({
    url: request_url,
    method: request_options.method,
    headers,
    ...(request_data !== undefined ? { data: request_data } : {}),
    ...(is_upload ? { dataType: 'file' } : {}),
    responseType: response_type === 'blob' ? 'blob' : 'text',
    connectTimeout: timeout_ms,
    readTimeout: timeout_ms,
    disableRedirects: true,
  });
  const response_headers = new Headers(native_response.headers);
  const is_json = response_headers.get('Content-Type')?.toLowerCase().includes('application/json');
  let response_body = native_response.data;
  if (native_response.status === 204) response_body = null;
  else if (response_type === 'blob' && !is_json) {
    response_body = Uint8Array.from(atob(response_body), (character) => character.charCodeAt(0));
  } else if (typeof response_body !== 'string') response_body = JSON.stringify(response_body);
  return new Response(response_body, { status: native_response.status, headers: response_headers });
}

export async function ios_fetch(request_url, request_options, transport_options) {
  const { signal } = request_options;
  if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
  let cancel_request;
  const cancelled_request = new Promise((_resolve, reject) => {
    cancel_request = () => reject(new DOMException('Request aborted', 'AbortError'));
    signal.addEventListener('abort', cancel_request, { once: true });
  });
  try {
    // CapacitorHttp cannot cancel an in-flight native request. Bound its native
    // timeout too, and stop waiting when the caller cancels or its timer expires.
    return await Promise.race([
      send_ios_request(request_url, request_options, transport_options),
      cancelled_request,
    ]);
  } finally {
    signal.removeEventListener('abort', cancel_request);
  }
}
