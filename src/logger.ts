import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Sans ca, un objet Error passe sous la cle `err` se serialise en `{}` (ses proprietes
  // message/stack ne sont pas enumerables) et masque la vraie cause dans les logs.
  serializers: { err: pino.stdSerializers.err },
});
