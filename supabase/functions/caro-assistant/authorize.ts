// Small adapter avoids coupling the testable authorization decision to SDK query-builder types.
type Access = {
  getUser: (token: string) => PromiseLike<{ data: { user: { id: string; is_anonymous?: boolean } | null }; error: unknown }>;
  getMember: (userId: string) => PromiseLike<{ data: { user_id: string } | null; error: unknown }>;
}
// Match caro.'s existing access contract: verified user + own enabled membership, never JWT metadata.
export async function authorizeMember(access: Access, token: string): Promise<string | null> {
  const { data, error } = await access.getUser(token)
  if (error || !data.user || data.user.is_anonymous) return null
  const member = await access.getMember(data.user.id)
  if (member.error || member.data?.user_id !== data.user.id) return null
  return data.user.id
}
