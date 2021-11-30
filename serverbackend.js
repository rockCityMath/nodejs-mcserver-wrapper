//Configure the settings minecraft is started with, will be modifiable from webpage in future
var runtimeConfig = ['-Xmx20G',  '-Xms20G', '-jar', 'server.jar', 'nogui'];

const { spawn } = require('child_process');
const { Rcon } = require('rcon-client');
const app = require('express')();
const httpServer = require('http').createServer(app);
const fs = require('fs')
const readline = require('readline');

var cors = require("cors");
const { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } = require('constants');
const { stringify } = require('querystring');
const request = require('request');
var os = require('os');
const { lstat } = require('fs');
const { on } = require('events');

const corsOptions ={
	origin: "*",
	credentials: true,
	optionSuccessStatus: 200,
}
app.use(cors(corsOptions));

//Server config
const io = require('socket.io')(httpServer, {
  cors: {origin : '*'}
});
const port = process.env.PORT || 3000;
var serverRunning = false;
var SERVERPROCESS = 'undefined';

//RCON Connection Config
rcon = new Rcon({
    host: "0.0.0.0",
    port: 25575,
    password: "password"
})

httpServer.listen(3000, () => {
  console.log('listening on localhost:3000');
});

//Pick up new connections to socket
io.on('connection', (socket) => {
  console.log('Socket connected...');
});

//Spawn and set up server JAR interface
async function startServer() {
  SERVERPROCESS = spawn('java', runtimeConfig, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  serverRunning = true;

  SERVERPROCESS.stderr?.pipe(process.stderr);

  let rconRegex = /Thread RCON Listener started/;
  let rconBool = false;

  //For each chunk of data from JAR
  SERVERPROCESS.stdout?.on('data', (chunk) => {
  chunk
      .toString()
      .split('\n')
      .forEach(message => {
          console.log(message);
          if(message.match(rconRegex)) {
              rconBool = true;
              console.log("RCON ACTIVE!");
              rcon.connect();
          }
          io.emit('chat message', message);
      });
  });

  //On server exit
  SERVERPROCESS.on('close', () => {
    console.log('SERVERPROCESS Ended');
    SERVERPROCESS = 'undefined';
  });

}

//RCON Events
rcon.on("connect", () => console.log("RCON Connected"));
rcon.on("authenticated", () => console.log("RCON Authenticated"));
rcon.on("end", () => console.log("RCON End"));

//On chat message
io.on('connection', (socket) => {
  socket.on('chat message', async (msg) => {
        
    //If server is running
    if(SERVERPROCESS != 'undefined') {
      console.log('Web Command: ' + msg);
      let responses = await Promise.all([
        rcon.send(msg),
      ])
      for (response of responses) {
        console.log(response + "\n");
        io.emit('chat message', response);
      }
    }
    else {
      if(msg == 'start') {
        console.log('Server started via web console...')
        io.emit('chat message', "Server starting...");
        startServer();
      }
      else {
        io.emit('chat message', 'Server inactive, please run "start"');
        console.log('Non-Start input to inactive server...');
      }
    }
  });
});

//Return array of past messages
app.get('/messageHistory', function(req, res) {
  
  fs.stat('logs/latest.log', (error, status) =>{
    if(error) {
      console.log(error);
    }
    else {
      const fileStream = fs.createReadStream('logs/latest.log');
      const rl = readline.createInterface({
        input: fileStream,
        crlyDelay: Infinity
      });
      rl.on('uncaughtException', function(err) {
        console.log(err);
      });
      rl.on('line', function(line) {
        io.emit('chat message', line);
      });
      console.log("History produced...");
    }
  });
  res.json(1);
});

//Get various information about the host machine
app.get('/serverInfo', function(req, res) {
  var cpuInfoJSON = os.cpus();
  var publicIP;

  //Calculate number of cores(only accurate if one kind of cpu is in machine)
  var coreCount = 0;
  for(const i of cpuInfoJSON) {
      coreCount++;
  }

  //Get public IP
  request('https://api.ipify.org', { json: false }, (err, res, body) => {
  if (err) { return console.log(err); }
      this.publicIP = body;
      console.log(body);
  });

  //Save data to JSON object
  const serverInfo = {
      cores: coreCount,
      model: os.cpus()[0].model,
      totalMem: (os.totalmem() / (1024*1024*1024)).toFixed(2), //Repalce with real constant
      freeMem: (os.freemem() / (1024*1024*1024)).toFixed(2),
      //eno1: os.networkInterfaces().en0[0].address,
      publicIP: this.publicIP,
      arch: os.arch()
  }    
  res.json(serverInfo);
})

//Determine if the minecraft server process is active
app.get('/serverStatus', function(req, res) {
  if(SERVERPROCESS != 'undefined') {
    res.json("ON")
  }
  else {
    res.json("OFF");
  }
})




