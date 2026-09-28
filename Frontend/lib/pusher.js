import Pusher from "pusher";
import PusherClient from "pusher-js";

let server;
let browser;

function getPusherServer() {
  if (!server) {
    const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } =
      process.env;

    if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
      throw new Error(
        "Pusher server is not configured. Set PUSHER_APP_ID, PUSHER_KEY, " +
          "PUSHER_SECRET and PUSHER_CLUSTER."
      );
    }

    server = new Pusher({
      appId: PUSHER_APP_ID,
      key: PUSHER_KEY,
      secret: PUSHER_SECRET,
      cluster: PUSHER_CLUSTER,
      useTLS: true,
    });
  }

  return server;
}

function getPusherClient() {
  if (!browser) {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      throw new Error(
        "Pusher client is not configured. Set NEXT_PUBLIC_PUSHER_KEY and " +
          "NEXT_PUBLIC_PUSHER_CLUSTER."
      );
    }

    browser = new PusherClient(key, {
      cluster,
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
      },
    });
  }

  return browser;
}

export const pusherServer = {
  trigger: (...args) => getPusherServer().trigger(...args),
  authorizeChannel: (...args) => getPusherServer().authorizeChannel(...args),
};

export const pusherClient = {
  subscribe: (...args) => getPusherClient().subscribe(...args),
  unsubscribe: (...args) => getPusherClient().unsubscribe(...args),
};
