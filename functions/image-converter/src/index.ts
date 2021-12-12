import { Callback, CloudFrontRequestEvent, Context } from "aws-lambda";
import { S3 } from "aws-sdk";
import fs from "fs";
import querystring from "querystring";
import sharp from "sharp";

const HTTP_NOT_FOUND = 404;

exports.handler = async (event: CloudFrontRequestEvent, context: Context, callback: Callback) => {
    const request = event.Records[0].cf.request;
    const origin = request.origin!.s3;
    const tmpPath = "/tmp/sourceImage";
    const targetPath = "/tmp/targetImage";

    const options = querystring.parse(request.querystring);
    const width = parseInt(options.width as string) || undefined;
    const height = parseInt(options.height as string) || undefined;

    // If convert option is disabled or width and height are not provided
    // serve the content from the origin directly
    if (!options.convert || options.convert === "false" || (!width && !height)) {
        return request;
    }

    // dowload the file from the origin server
    let contentType;
    try {
        const [bucketName] = origin!.domainName.split(".");
        const { Body: fileContent, ContentType } = await new S3().getObject({
            Bucket: bucketName!,
            Key: `${origin!.path}${request.uri}`.substring(1)
        }).promise();
        fs.writeFileSync(tmpPath, fileContent as string);
        contentType = ContentType;
    } catch (err) {
        if (err.statusCode === HTTP_NOT_FOUND) {
            return {
                status: "404",
                statusDescription: "Requested file does not exist."
            };
        }
    }

    try {
        await sharp(tmpPath)
            .resize({
                width,
                height
            })
            .toFile(targetPath);
    } catch (err) {
        return {
            status: "400",
            statusDescription: "Error converting the image. Please check if the requested file is actually a valid image."
        };
    }

    const image = fs.readFileSync(targetPath).toString("base64");
    return {
        bodyEncoding: "base64",
        body: image,
        headers: {
            "content-type": [{
                key: "Content-Type",
                value: contentType
            }]
        },
        status: "200",
        statusDescription: "OK"
    };
};
