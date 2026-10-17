import { Capacitor } from '@capacitor/core';
import { translate as t } from './i18n';
import { ios_fetch } from './nativeHttp';
const api_base_url = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

export class apiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'apiError';
    this.status = status;
  }
}

export async function api_request(path, { method = 'GET', body, signal, response_type = 'json' } = {}) {
  const is_upload = typeof FormData !== 'undefined' && body instanceof FormData;
  const uses_ios_http = Capacitor.getPlatform() === 'ios';
  const timeout_ms = is_upload ? 45000 : 12000;
  const request_controller = new AbortController();
  let timed_out = false;
  const cancel_request = () => request_controller.abort();
  const timeout_id = setTimeout(() => {
    timed_out = true;
    request_controller.abort();
  }, timeout_ms);
  if (signal?.aborted) request_controller.abort();
  signal?.addEventListener('abort', cancel_request, { once: true });
  try {
    const request_url = `${api_base_url}/api/v1${path}`;
    console.info(`[API_REQUEST] ${method} ${request_url} transport=${uses_ios_http ? 'ios_native' : 'fetch'}`);
    const request_options = {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && !is_upload ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: is_upload ? body : JSON.stringify(body) } : {}),
      signal: request_controller.signal,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
    };
    const response = uses_ios_http
      ? await ios_fetch(request_url, request_options, { is_upload, timeout_ms, response_type })
      : await fetch(request_url, request_options);
    console.info(`[API_RESPONSE] ${method} ${path} status=${response.status} request_id=${response.headers.get('x-request-id') || '-'}`);
    if (response.status === 204) return null;
    if (response.ok && response_type === 'blob') return await response.blob();
    const response_data = await response.json().catch(() => null);
    if (!response.ok) {
      const error_messages = {
        401: t("로그인 정보가 유효하지 않거나 만료되었습니다."),
        403: t("이 작업을 사용할 권한이 없습니다."),
        422: t("입력한 항목의 형식과 길이를 확인해 주세요."),
        429: t("요청이 많습니다. 1분 후 다시 시도해 주세요."),
      };
      const server_detail = response.status < 500 && typeof response_data?.detail === 'string'
        ? response_data.detail : null;
      throw new apiError((response.status === 401 ? error_messages[401] : server_detail)
        || error_messages[response.status] || t("서버 요청에 실패했습니다."), response.status);
    }
    if (!response_data) throw new apiError(t("서버 응답을 읽을 수 없습니다."));
    return response_data;
  } catch (error) {
    console.error(`[API_ERROR] ${method} ${path} name=${error.name || 'Error'} message=${error.message || 'unknown'}`);
    if (signal?.aborted) throw error;
    if (timed_out) throw new apiError(t("응답 시간이 초과되었습니다. 저장 결과는 새로고침으로 확인해 주세요."));
    if (error instanceof apiError) throw error;
    throw new apiError(t("서버에 연결할 수 없습니다. 네트워크 연결을 확인해 주세요."));
  } finally {
    clearTimeout(timeout_id);
    signal?.removeEventListener('abort', cancel_request);
  }
}
