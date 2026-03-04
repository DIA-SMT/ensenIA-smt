import { supabase } from '../lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';

export { supabase };

export class ServiceError extends Error {
  constructor(message: string, public pgError?: PostgrestError) {
    super(message);
    this.name = 'ServiceError';
  }
}

/** Unwrap a Supabase query result, throwing on error or null data. */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) throw new ServiceError(result.error.message, result.error);
  if (result.data === null) throw new ServiceError('No data returned');
  return result.data;
}
