import type { z } from 'zod'
import type { Database } from './database.types'
import { toGameError } from './errors'
import { supabase } from './supabase'

type Fns = Database['public']['Functions']
export type RpcName = keyof Fns

/** Calls an RPC, throwing a GameError on failure. */
export async function rpc<N extends RpcName>(name: N, args: Fns[N]['Args']): Promise<unknown> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw toGameError(error)
  return data
}

/** Calls an RPC and validates its response with Zod. */
export async function rpcParsed<N extends RpcName, S extends z.ZodType>(
  name: N,
  args: Fns[N]['Args'],
  schema: S,
): Promise<z.infer<S>> {
  const data = await rpc(name, args)
  return schema.parse(data)
}
