// backend/middleware/auth.js
// Verifies Supabase access tokens and resolves the caller's YES.AI role.
// The service-role key stays server-side in Railway.

import { supabase } from '../lib/supabaseClient.js';

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

export async function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired access token' });

  req.auth = { user, token, role: null, clientId: null };
  next();
}

export async function resolveYesAiRole(req, res, next) {
  const authUid = req.auth?.user?.id;
  if (!authUid) return res.status(401).json({ error: 'Authentication required' });

  const { data: admin, error: adminError } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('auth_uid', authUid)
    .maybeSingle();

  if (adminError) return res.status(500).json({ error: 'Unable to verify account role' });
  if (admin) {
    req.auth.role = 'admin';
    req.auth.adminRole = admin.role;
    return next();
  }

  const { data: clientUser, error: clientError } = await supabase
    .from('client_users')
    .select('client_id')
    .eq('auth_uid', authUid)
    .maybeSingle();

  if (clientError) return res.status(500).json({ error: 'Unable to verify account role' });
  if (!clientUser?.client_id) return res.status(403).json({ error: 'Account is not linked to a YES.AI client' });

  req.auth.role = 'client';
  req.auth.clientId = clientUser.client_id;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.auth?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

export function requireClientAccess(req, res, next) {
  if (req.auth?.role === 'admin') return next();
  if (req.auth?.role === 'client' && req.auth.clientId === req.params.id) return next();
  return res.status(403).json({ error: 'You cannot access another client account' });
}
