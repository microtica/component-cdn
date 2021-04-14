"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const https_1 = __importDefault(require("https"));
const node_forge_1 = require("node-forge");
const MS_BEFORE_TIMEOUT = 2000;
const KEY_BITS = 2048;
async function handler(event, context) {
    // tslint:disable-next-line
    console.log("EVENT", JSON.stringify(event));
    try {
        startTransaction(event, context);
        const { privateKey, publicKey } = node_forge_1.pki.rsa.generateKeyPair(KEY_BITS);
        const privatePem = node_forge_1.pki.privateKeyToPem(privateKey);
        const publicPem = node_forge_1.pki.publicKeyToPem(publicKey);
        await commitStatus(event, "SUCCESS", {
            privateKey: privatePem,
            publicKey: publicPem
        }, "RSA keys successfully created");
    }
    catch (error) {
        console.error(error);
        // tslint:disable-next-line:no-console
        console.log("EVENT", JSON.stringify(event));
        await commitStatus(event, "FAILED", {}, error.message);
    }
}
exports.handler = handler;
/**
 * Notify CFN for certain status change
 *
 * @param {*} status
 * @param {*} [data={}]
 * @param {string} [reason=""]
 * @returns
 */
function commitStatus(event, status, data = {}, reason = "") {
    const responseBody = JSON.stringify({
        Status: status,
        Reason: reason,
        PhysicalResourceId: event.LogicalResourceId,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: data
    });
    console.log("RESPONSE BODY:\n", responseBody);
    return new Promise((resolve, reject) => {
        // const parsedUrl = url.parse(event.ResponseURL);
        const options = {
            method: "PUT",
            headers: {
                "content-type": "",
                "content-length": responseBody.length
            }
        };
        console.log("SENDING RESPONSE...\n");
        const request = https_1.default.request(event.ResponseURL, options, response => {
            console.log("STATUS: ", response.statusCode);
            console.log("HEADERS: ", JSON.stringify(response.headers));
            // Tell AWS Lambda that the function execution is done
            resolve();
        });
        request.on("error", error => {
            console.log("sendResponse Error:" + error);
            // Tell AWS Lambda that the function execution is done
            reject(error);
        });
        // write data to request body
        request.write(responseBody);
        request.end();
    });
}
/**
 * Start waiting component to execute all activities in given time set by timeout parameter.
 * If activities does not finish 1 second before the specified timeout,
 * this function notifies CFN for failure
 */
function startTransaction(event, context) {
    const timeoutHandler = () => {
        console.log("Timeout FAILURE!");
        // Emit event to "sendResponse", then callback with an error from this function
        // tslint:disable-next-line:no-unused-expression
        console.debug("EVENT", JSON.stringify(event));
        commitStatus(event, "FAILED", {}, "Component runtime failed to provision. Timeout.");
    };
    // Set timer so it triggers one second before this function would timeout
    setTimeout(timeoutHandler, context.getRemainingTimeInMillis() - MS_BEFORE_TIMEOUT);
}
//# sourceMappingURL=index.js.map