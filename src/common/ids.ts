import { randomBytes } from 'node:crypto';

/** 24-character hex id, the same shape as Base44 record ids. */
export const newId = (): string => randomBytes(12).toString('hex');

/** Payment order id: readable prefix + time + randomness, e.g. WLT1760000000000a1b2c3. */
export const newOrderId = (prefix: string): string => `${prefix}${Date.now()}${randomBytes(3).toString('hex')}`;
