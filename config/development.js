const path = require("path");
const root = path.join.bind(path, __dirname, "..");
console.log("==> Loading ota-default");

module.exports = {
  server: {
  },
  connections: {
    default: {
      host: 'localhost',
      port: 3000
    }
  },
  plugins: {
    "inert": {
      enable: true
    },
    "electrode-ota-server-dao-cassandra": {
     enable: false
    },
    "electrode-ota-server-dao-plugin": {
      module: "electrode-ota-server-dao-mariadb",
      priority: 4,
      options: {
        poolConfigs: [{
          host: "127.0.0.1",
          port: 33060,
          dialect: "mysql",
          database: "electrode_ota",
          user: "ota",
          password: "ota"
        }]
      }
    },
    "electrode-ota-server-fileservice-upload": {
      priority: 10,
      options: {
        downloadUrl: "http://localhost:3000/storagev2/"
      }
    },
    "electrode-ota-server-logger": {
      priority: 1
    },
    "electrode-ota-server-auth": {
      options: {
        strategy: {
          "github-oauth": {
            enable: false
          },
          basic: {
            module: "electrode-ota-server-auth-basic",
            scheme: "basic",
            options: {
              validateFunc: (request, username, password, callback) => {
                err = null;
                isValid = true;
                provider = "basic-auth";
                email = "lemaireb@gmail.com";
                displayName = "Benoit";
                profile = { email, displayName, username };
                credentials = { provider, profile };
                callback(err, isValid, credentials);
              }
            }
          }
        }
      }
    },
    "electrode-ota-server-routes-auth": {
      options: {
        providers: [
          {
            name: "basic",
            auth: "basic",
            label: "Basic Authentication",
            icon: {
              height: 50,
              width: 50
            }
          }
        ]
      }
    },
    "electrode-ota-server-routes-accesskeys": {
			options: {
        providers: [
          {
            name: "basic",
            auth: "basic",
            label: "Basic Authentication",
            icon: {
              height: 50,
              width: 50
            }
          }
        ]
      }
    },
    "electrode-ota-server-routes-apps": {
      options: {
        providers: [
          {
            name: "basic",
            auth: "basic",
            label: "Basic Authentication",
            icon: {
              height: 50,
              width: 50
            }
          }
        ]
      }
		}
  }
}
