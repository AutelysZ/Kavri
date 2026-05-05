import type { AnyConstructor } from '@kavri/basic';
import { describe, expect, it } from 'vitest';
import { Schema } from './schema.js';
import { defineWebSocket, message } from './websocket.js';

@Schema()
class HelloPayload {
  text!: string;
}

@Schema()
class AckPayload {
  ok!: boolean;
}

@Schema()
class HandshakeRequest {
  token!: string;
}

describe('message', () => {
  it('captures the payload constructor', () => {
    const m = message(HelloPayload);
    expect(m.payload).toBe(HelloPayload);
  });

  it('does not attach a `direction` field', () => {
    expect(message(HelloPayload)).not.toHaveProperty('direction');
  });

  it('accepts a string discriminator as the second arg', () => {
    expect(message(HelloPayload, 'hello.v1').discriminator).toBe('hello.v1');
  });

  it('accepts an options object as the second arg', () => {
    const m = message(AckPayload, { summary: 'ack', codec: 'msgpack' });
    expect(m.summary).toBe('ack');
    expect(m.codec).toBe('msgpack');
  });

  it('merges discriminator string with the options arg', () => {
    const m = message(HelloPayload, 'hello.v1', { description: 'first hello' });
    expect(m.discriminator).toBe('hello.v1');
    expect(m.description).toBe('first hello');
  });

  it('payload `null` represents a payload-less message', () => {
    expect(message(null).payload).toBeNull();
  });
});

describe('defineWebSocket', () => {
  it('preserves the inbound/outbound map identity (no copy / no rewrap)', () => {
    const inboundMap = { sendHello: message(HelloPayload) };
    const outboundMap = { ack: message(AckPayload) };
    const def = defineWebSocket({
      name: 'Chat',
      path: '/ws/chat',
      inbound: inboundMap,
      outbound: outboundMap,
    });
    expect(def.inbound).toBe(inboundMap);
    expect(def.outbound).toBe(outboundMap);
  });

  it('keeps shared options on the protocol root', () => {
    const def = defineWebSocket({
      name: 'Chat',
      path: '/ws/chat',
      summary: 'Chat protocol',
      description: 'real-time chat',
      codec: 'json',
      maxMessageSize: 1 << 20,
      inbound: {},
      outbound: {},
    });
    expect(def.summary).toBe('Chat protocol');
    expect(def.description).toBe('real-time chat');
    expect(def.codec).toBe('json');
    expect(def.maxMessageSize).toBe(1 << 20);
  });

  it('attaches an upgrade-time handshake request schema', () => {
    const def = defineWebSocket({
      name: 'Chat',
      path: '/ws/chat',
      request: HandshakeRequest,
      inbound: {},
      outbound: {},
    });
    expect(def.request).toBe(HandshakeRequest);
  });

  it('infers TReq from the `request` constructor', () => {
    const def = defineWebSocket({
      name: 'Chat',
      path: '/ws/chat',
      request: HandshakeRequest,
      inbound: {},
      outbound: {},
    });
    // Compile-time: `def.request` is `AnyConstructor<HandshakeRequest> | undefined`.
    // The typecheck step is the real assertion; this annotated assignment
    // would fail typecheck if TReq weren't inferred.
    const reqCtor: AnyConstructor<HandshakeRequest> | undefined = def.request;
    expect(reqCtor).toBe(HandshakeRequest);
  });

  it('preserves message typing through the generics', () => {
    const def = defineWebSocket({
      name: 'Chat',
      path: '/ws/chat',
      inbound: { sendHello: message(HelloPayload) },
      outbound: { ack: message(AckPayload) },
    });
    expect(def.inbound.sendHello.payload).toBe(HelloPayload);
    expect(def.outbound.ack.payload).toBe(AckPayload);
  });
});
