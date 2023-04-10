import { CloudFrontRequestEvent, Context } from "aws-lambda";
import { CloudFront, Lambda, SecretsManager } from "aws-sdk";
import https from "https";
import querystring from "querystring";
import sharp from "sharp";

exports.handler = async (event: CloudFrontRequestEvent, context: Context) => {
    const request = event.Records[0].cf.request;
    const config = event.Records[0].cf.config;

    const options = querystring.parse(request.querystring);
    const width = parseInt(options.width as string) || undefined;
    const height = parseInt(options.height as string) || undefined;

    // If convert option is disabled or width and height are not provided
    // serve the content from the origin directly
    if (!options.convert || options.convert === "false" || (!width && !height)) {
        return request;
    }

    try {
        const [, , , , AWS_ACCOUNT_ID, , FULL_FUNCTION_NAME] = context.invokedFunctionArn.split(":");
        const [AWS_REGION, FUNCTION_NAME] = FULL_FUNCTION_NAME.split(".");
        const functionArn = `arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:${FUNCTION_NAME}`;

        const { image, contentType } = await convertImage(
            functionArn,
            config.distributionDomainName,
            request.uri,
            width,
            height
        );

        return {
            bodyEncoding: "base64",
            body: image,
            headers: contentType && {
                "content-type": [{
                    key: "Content-Type",
                    value: contentType
                }]
            },
            status: "200",
            statusDescription: "OK"
        };
    } catch (err) {
        console.log("Conversion ERROR", JSON.stringify(err));
        return {
            status: "400",
            statusDescription: "Error converting the image. Please check if the requested file is actually a valid image."
        };
    }
};

const convertImage = async (functionArn: string, hostname: string, url: string, width?: number, height?: number) => {
    const signedUrl = await getSignedUrl(functionArn, `https://${hostname}${url}`);

    return new Promise((resolve: (arg: { image: string; contentType?: string; }) => void, reject) => {
        // make an HTTPS request to the CloudFront URL
        const request = https.request(signedUrl, response => {
            // check that the response is a success (2xx status code)
            const SUCCESS_CODE_START = 200;
            const SUCCESS_CODE_END = 300;
            if (response.statusCode! >= SUCCESS_CODE_START && response.statusCode! < SUCCESS_CODE_END) {

                // pipe the response stream through Sharp for image processing and conversion
                const convertedStream = response.pipe(
                    sharp().resize({
                        width,
                        height
                    })
                );

                convertedStream.on("error", err => {
                    reject(err);
                });

                const chunks: Buffer[] = [];
                convertedStream.on("data", (data: Buffer) => {
                    chunks.push(data);
                });

                convertedStream.on("end", () => {
                    const processedData = Buffer.concat(chunks);
                    resolve({
                        image: processedData.toString("base64"),
                        contentType: response.headers["content-type"]
                    });
                });
            } else {
                reject(response.statusCode);
                // if the request fails, log an error message with the status code
                console.error("Request failed:", response.statusCode);
            }
        });

        // handle any errors that occur during the HTTPS request
        request.on("error", err => {
            reject(err);
        });

        // send the HTTPS request
        request.end();
    });
};

const getSignedUrl = async (functionArn: string, originalUrl: string) => {
    try {
        const { Tags: tags } = await new Lambda({ region: "us-east-1" }).listTags({
            Resource: functionArn
        }).promise();

        const region = tags!["microtica:region"];
        const envId = tags!["microtica:environment"];
        const resourceId = tags!["microtica:resource"];
        const restrictedAccess = tags!["microtica:resource:restrict-access"];

        if (restrictedAccess === "false") {
            return originalUrl;
        }

        const secretManager = new SecretsManager({ region });

        const { SecretList: secrets } = await secretManager.listSecrets({
            Filters: [{
                Key: "tag-key",
                Values: ["microtica:environment", "microtica:resource"]
            }, {
                Key: "tag-value",
                Values: [envId!, resourceId!]
            }]
        }).promise();

        const { SecretString: secretString } = await secretManager.getSecretValue({
            SecretId: secrets![0].ARN!
        }).promise();

        const secret = JSON.parse(secretString!) as {
            privateKey: string;
            publicKey: string;
            keyId: string;
        };

        const buff = Buffer.from(secret.privateKey, "base64");
        const privateKey = buff.toString("ascii");

        const signer = new CloudFront.Signer(
            secret.keyId,
            privateKey
        );

        const MILLISECONDS_IN_SECOND = 1000;
        const SECONDS_IN_ONE_HOUR = 3600;

        const expires = Math.floor(Date.now() / MILLISECONDS_IN_SECOND) + SECONDS_IN_ONE_HOUR; // URL expires in 1 hour
        const signedUrl = signer.getSignedUrl({
            url: originalUrl,
            expires
        });

        return signedUrl;

    } catch (error) {
        console.log("ERROR signing URL", JSON.stringify(error));
        throw error;
    }
};
