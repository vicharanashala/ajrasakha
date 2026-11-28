import {describe, it, expect} from 'vitest';
import {scrubSensitiveEventData} from './sentryScrubbing.js';

describe('scrubSensitiveEventData', () => {
  it('redacts passwords from JSON string bodies and keeps other fields', () => {
    const event = scrubSensitiveEventData({
      request: {
        data: JSON.stringify({
          email: 'user@test.com',
          password: 'Str0ng!Passw0rd',
          currentPassword: 'Old!Passw0rd1',
          newPassword: 'N3w!Passw0rd',
          newPasswordConfirm: 'N3w!Passw0rd',
        }),
      },
    });

    const body = JSON.parse(event.request.data as string);
    expect(body.email).toBe('user@test.com');
    expect(body.password).toBe('[Filtered]');
    expect(body.currentPassword).toBe('[Filtered]');
    expect(body.newPassword).toBe('[Filtered]');
    expect(body.newPasswordConfirm).toBe('[Filtered]');
    expect(event.request.data).not.toContain('Passw0rd');
  });

  it('redacts nested object bodies', () => {
    const event = scrubSensitiveEventData({
      request: {data: {user: {password: 'x'}, list: [{idToken: 'y', name: 'kept'}]}},
    });

    expect(event.request.data).toEqual({
      user: {password: '[Filtered]'},
      list: [{idToken: '[Filtered]', name: 'kept'}],
    });
  });

  it('redacts credential headers and drops cookies', () => {
    const event = scrubSensitiveEventData({
      request: {
        headers: {
          authorization: 'Bearer eyJ...',
          'x-internal-api-key': 'internal-key',
          'content-type': 'application/json',
        },
        cookies: {session: 'abc'},
      },
    });

    expect(event.request.headers).toEqual({
      authorization: '[Filtered]',
      'x-internal-api-key': '[Filtered]',
      'content-type': 'application/json',
    });
    expect(event.request).not.toHaveProperty('cookies');
  });

  it('drops raw non-JSON bodies that mention credentials and keeps harmless ones', () => {
    expect(scrubSensitiveEventData({request: {data: 'email=a&password=secret'}}).request.data).toBe('[Filtered]');
    expect(scrubSensitiveEventData({request: {data: 'plain text body'}}).request.data).toBe('plain text body');
  });

  it('leaves events without request data untouched', () => {
    const event = {message: 'boom', request: undefined};
    expect(scrubSensitiveEventData(event)).toEqual({message: 'boom'});
  });
});
