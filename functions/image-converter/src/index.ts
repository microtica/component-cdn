import { Callback, CloudFrontRequestEvent, Context } from "aws-lambda";
import { S3 } from "aws-sdk";
import fs from "fs";
import querystring from "querystring";
import sharp from "sharp";

// interface Headers {
//     [key: string]: {
//         key: string;
//         value?: string | string[]
//     }[];
// }

exports.handler = async (event: CloudFrontRequestEvent, context: Context, callback: Callback) => {
    console.log(JSON.stringify(event));
    const request = event.Records[0].cf.request;
    const origin = request.origin!.s3;
    const tmpPath = "/tmp/sourceImage";
    const targetPath = "/tmp/targetImage";

    const options = querystring.parse(request.querystring);
    const maxSize = 2000;
    const width = Math.min(parseInt(options.width as string) || maxSize, maxSize);
    const height = Math.min(parseInt(options.height as string) || maxSize, maxSize);

    // If convert option is disabled serve the content from the origin directly
    if (!options.convert || options.convert === "false") {
        return request;
    }

    // make sure input values are numbers
    if (Number.isNaN(width) || Number.isNaN(height)) {
        return {
            status: "400",
            statusDescription: "Invalid input for width and height."
        };
    }

    // dowload the file from the origin server
    const [bucketName] = origin!.domainName.split(".");
    const { Body: fileContent } = await new S3().getObject({
        Bucket: bucketName!,
        Key: `${origin!.path}${request.uri}`.substring(1)
    }).promise();

    fs.writeFileSync(tmpPath, fileContent as string);

    await sharp(tmpPath)
        .resize(width, height)
        .toFile(targetPath);

    const image = fs.readFileSync(targetPath).toString("base64");

    return {
        bodyEncoding: "base64",
        body: image,
        // headers: originHeaders,
        status: "200",
        statusDescription: "OK"
    };
};
