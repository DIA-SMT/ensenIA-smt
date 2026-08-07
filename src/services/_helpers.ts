import { supabase } from '../lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';

export { supabase };

export class ServiceError extends Error {
  pgError?: PostgrestError;

  constructor(message: string, pgError?: PostgrestError) {
    super(message);
    this.name = 'ServiceError';
    this.pgError = pgError;
  }
}

/** Unwrap a Supabase query result, throwing on error or null data. */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): NonNullable<T> {
  if (result.error) throw new ServiceError(result.error.message, result.error);
  if (result.data === null || result.data === undefined) throw new ServiceError('No data returned');
  return result.data;
}
