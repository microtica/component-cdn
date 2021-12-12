import { Callback, CloudFrontRequestEvent, Context } from "aws-lambda";
import { S3 } from "aws-sdk";
import fs from "fs";
import querystring from "querystring";
import sharp from "sharp";

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
        if (err.statusCode === 404) {
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
                height,
                fit: sharp.fit.cover
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
