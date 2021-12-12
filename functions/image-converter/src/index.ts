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

    // make sure input values are numbers
    if (Number.isNaN(width) || Number.isNaN(height)) {
        console.log("Invalid input");
        return {
            status: "400",
            statusDescription: "Invalid input"
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

    console.log("image", image);

    return {
        bodyEncoding: "base64",
        body: image,
        // headers: originHeaders,
        status: "200",
        statusDescription: "OK"
    };
    // const writeStream = fs.createWriteStream(tmpPath);
    // res
    //     .on("error", _ => {
    //         callback(null, {
    //             status: "500",
    //             statusDescription: "Error downloading the image"
    //         });
    //     })
    //     .pipe(writeStream);

    // writeStream
    //     .on("finish", () => {
    //         console.log("image downloaded");

    //         try {
    //             // invoke ImageMagick to resize the image
    //             sharp(tmpPath)
    //                 .resize(width, height)
    //                 .toFile(targetPath)
    //             // child.execSync(
    //             //     `convert ${tmpPath} -resize ${width}x${height}\\> -quality 80 ${targetPath}`
    //             // );
    //         } catch (e) {
    //             console.log("ImageMagick error");
    //             console.log(e.stderr.toString());
    //             callback(null, {
    //                 status: "500",
    //                 statusDescription: "Error resizing image"
    //             });
    //             return;
    //         }

    //         const image = fs.readFileSync(targetPath).toString("base64");

    //         callback(null, {
    //             bodyEncoding: "base64",
    //             body: image,
    //             // headers: originHeaders,
    //             status: "200",
    //             statusDescription: "OK"
    //         });
    //     })
    //     .on("error", e => {
    //         console.log(e);
    //         callback(null, {
    //             status: "500",
    //             statusDescription: "Error writing the image to a file"
    //         });
    //     });
};
