const http = require("http");
const https = require("https");
const url = require("url");
const path = require("path");
const querystring = require("querystring");

var shared = {
  shouldOpen: false,
  replyUrl: null
};

var server = http.createServer();

const handlers = [
  guard("POST", "/incoming", handleSlackMessage),
  guard("POST", "/api/reset", handleReset),
  guard("GET", "/api", handleApi),
];

const ackReply = {
  response_type: "in_channel",
  text: "You got it boss! Hang tight...",
  attachments: []
};

const successReply = {
  response_type: "in_channel",
  text: "Alright, the gate is open! :thumbsup:",
  attachments: []
};

const failReply = {
  response_type: "in_channel",
  text: "Argh! Something's busted in my programming, I couldn't open the gate for you. :disappointed:",
  attachments: []
};

server.on("request", mainRequest);
server.on("close", () => { console.log("Shutting down server."); });
server.on("listening", () => { console.log("Server listening"); });
server.listen(process.env.PORT || 3000);

function handleSlackMessage(request, response) {
  if (request.headers["content-type"] !== "application/x-www-form-urlencoded") { return badRequest(response); }

  var data = "";
  var parsedData = null;

  request.setEncoding("utf-8");
  request.on("data", (chunk) => { data += chunk; });

  request.on("end", () => {
    try {
      parsedData = querystring.parse(data);
    } catch(e) {
      return badRequest(response);
    }

    if (!parsedData) { return badRequest(response); }
    if (!parsedData.token || parsedData.token !== process.env.SLACK_TOKEN) { return badRequest(response); }
    if (!parsedData.command || (/(open)?.*gate/i).test(parsedData.command) !== true) { return badRequest(response); }

    shared.shouldOpen = true;
    shared.replyUrl = parsedData.response_url;

    // add a 5 second time limit for the gate to have opened
    setTimeout(checkFailure, 5000);

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(ackReply));
  });

  return response;
}

function handleReset(request, response) {
  if (request.headers["content-type"] !== "application/json") { return badRequest(response); }
  if (request.headers["x-api-token"] !== process.env.API_TOKEN) { return badRequest(response); }

  var parsedReplyUrl;
  var replyBody;
  var replyReq;
  var replyReqOpts;

  if (shared.replyUrl) {
    replyToSlack(successReply);
  } else {
    console.log("[WARN] Gate confirmed opened, but there is no reply URL for Slack.");
  }

  shared.shouldOpen = false;
  shared.replyUrl = null;

  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({
    success: true
  }));

  return response;
}

function checkFailure() {
  if (shared.shouldOpen === false) { return; }

  if (shared.replyUrl) {
    replyToSlack(failReply);
  } else {
    console.log("[ERROR] Gate failed to open, but there is no reply URL for Slack.");
  }

  shared.shouldOpen = false;
  shared.replyUrl = null;
}

function handleApi(request, response) {
  response.writeHead(200, { "Content-Type": "application/json" });

  return response.end(JSON.stringify({
    shouldOpen: shared.shouldOpen
  }));
}

function replyToSlack(body) {
  if (!shared.replyUrl) { return; }

  parsedReplyUrl = url.parse(shared.replyUrl);
  replyBody = JSON.stringify(body);
  replyReqOpts = {
    method: "POST",
    hostname: parsedReplyUrl.host,
    port: parsedReplyUrl.protocol === "https:" ? 443 : 80,
    path: parsedReplyUrl.path,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(replyBody)
    }
  };

  replyReq = (parsedReplyUrl.protocol === "https:") ? https.request(replyReqOpts) : http.request(replyReqOpts);
  replyReq.on("response", (res) => {
    if (res.statusCode !== 200) {
      console.log("[ERROR] Got non-200 reply from Slack when trying to reply: ", res.statusCode);
    }
  });
  replyReq.on("error", (e) => {
    console.log("[ERROR] Could not reply to Slack URL: ", e);
  });
  replyReq.write(replyBody);
  replyReq.end();
}

function badRequest(response) {
  response.writeHead(400, { "Content-Type": "text/plain" });
  return response.end("Bad request.");
}

function guard(method, reqPath, handler) {
  return requestGuard.bind(null, method, path.join(reqPath, "/"), handler);
}

function requestGuard(guardMethod, guardPath, originalHandler, request, response) {
  var parsedUrl = url.parse(request.url);

  if (request.method !== guardMethod) { return false; }
  if (path.join(parsedUrl.path, "/") !== guardPath) { return false; }

  return originalHandler(request, response);
}

function mainRequest(request, response) {
  var result;

  for (var i = 0; i < handlers.length; i++) {
    result = handlers[i](request, response);
    if (result) {
      return result;
    }
    result = null;
  }

  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("Not found.");

  return;
}
