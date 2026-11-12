const { Agent, setGlobalDispatcher } = require("undici");
const dns = require("node:dns");

setGlobalDispatcher(
  new Agent({
    connect: {
      lookup(host, options, callback) {
        if (host === "api.vercel.com") {
          if (options?.all) {
            callback(null, [{ address: "76.76.21.21", family: 4 }]);
          } else {
            callback(null, "76.76.21.21", 4);
          }
        } else {
          dns.lookup(host, options, callback);
        }
      },
    },
  }),
);
