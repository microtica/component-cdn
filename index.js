const fs = require("fs");
const path = require("path");
const { NestedComponent } = require("@microtica/component").AwsCloud;
const { Lambda, IAM, STS } = require("aws-sdk");
const concat = require("concat-stream");

const component = new NestedComponent(
    () => handleCreateOrUpdate("create"),
    () => handleCreateOrUpdate("update"),
    handleDelete,
    "/tmp/index.json",
);

const {
    AWS_REGION
} = process.env;

async function handleCreateOrUpdate(action) {
    const { RetainContent, MIC_ENVIRONMENT_ID, MIC_RESOURCE_ID } = await component.getInputParameters();

    transformTemplate(RetainContent === "true");

    const [cloudfrontKeyPackage] = await uploadPackages();

    const keyName = `${MIC_ENVIRONMENT_ID}-${MIC_RESOURCE_ID}`;

    let originRequestLambdaArn = "";
    try {
        if (action === "create") {
            originRequestLambdaArn = await createOriginRequestFunction(keyName);
        } else if (action === "update") {
            originRequestLambdaArn = await updateOriginRequestFunction(keyName);
        }
    } catch (error) {
        console.log("Error while provisioning Origin Request Lambda", error);
    }

    return {
        KeyName: keyName,
        CloudfrontKeyLambdaBucket: cloudfrontKeyPackage.s3Bucket,
        CloudfrontKeyLambdaBucketKey: cloudfrontKeyPackage.s3Key,
        OriginRequestLambdaArn: originRequestLambdaArn
    };
}

async function handleDelete() {
    const { MIC_ENVIRONMENT_ID, MIC_RESOURCE_ID } = await component.getInputParameters();
    const keyName = `${MIC_ENVIRONMENT_ID}-${MIC_RESOURCE_ID}`;

    await deleteOriginRequestFunction(keyName);
}

async function createOriginRequestFunction(name) {
    const iam = new IAM();
    const lambda = new Lambda({ region: "us-east-1" });

    console.log("Creating Origin Request Lambda...");

    const { Policy: policy } = await iam.createPolicy({
        PolicyName: name,
        PolicyDocument: JSON.stringify({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "s3:*"
                    ],
                    "Resource": "*"
                }
            ]
        })
    }).promise();

    console.log("Created Lambda policy");

    const { Role: role } = await iam.createRole({
        RoleName: name,
        AssumeRolePolicyDocument: JSON.stringify({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "Service": [
                            "edgelambda.amazonaws.com",
                            "lambda.amazonaws.com"
                        ]
                    },
                    "Action": [
                        "sts:AssumeRole"
                    ]
                }
            ]
        })
    }).promise();

    console.log("Created Lambda role");

    await Promise.all([
        iam.attachRolePolicy({
            PolicyArn: policy.Arn,
            RoleName: role.Arn
        }),
        iam.attachRolePolicy({
            PolicyArn: "AWSLambdaExecute",
            RoleName: role.Arn
        })
    ]);
    // Wait for the IAM changes to be propagated
    await timeout(10000);

    await lambda.createFunction({
        FunctionName: name,
        Handler: "dst/index.handler",
        Runtime: "nodejs14.x",
        Timeout: 30,
        Code: {
            ZipFile: await getOriginRequestLambdaPackage()
        },
        Role: role.Arn
    }).promise();

    await lambda.addPermission({
        FunctionName: name,
        Effect: "Allow",
        Principal: "replicator.lambda.amazonaws.com",
        Action: "lambda:GetFunction"
    }).promise();

    console.log("Created Lambda function");

    await timeout(10000);

    const { FunctionArn: arn } = await lambda.publishVersion({ FunctionName: name }).promise();

    console.log("Published new Lambda version");

    return arn;
}

async function updateOriginRequestFunction(name) {
    const lambda = new Lambda({ region: "us-east-1" });
    await lambda.updateFunctionCode({
        FunctionName: name,
        ZipFile: await getOriginRequestLambdaPackage()
    }).promise();

    const { FunctionArn: arn } = await lambda.publishVersion({ FunctionName: name }).promise();

    return arn;
}

async function getOriginRequestLambdaPackage() {
    return new Promise((res) => {
        const package = fs.createReadStream(path.join(__dirname, "functions/image-converter/package.zip"));

        package.pipe(concat(buffer => {
            res(buffer);
        }));
    });
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function deleteOriginRequestFunction(name) {
    const iam = new IAM();
    const lambda = new Lambda({ region: "us-east-1" });
    const { Account: accountId } = await new STS().getCallerIdentity().promise();
    const policyArn = `arn:aws:iam::${accountId}:policy/${name}`;

    await lambda.deleteFunction({ FunctionName: name }).promise();
    console.log("Deleted Lambda function");
    await iam.deleteRole({ RoleName: name }).promise();
    console.log("Deleted Lambda role");
    await iam.deletePolicy({ PolicyArn: policyArn }).promise();
    console.log("Deleted Lambda policy");
}

async function transformTemplate(retainContent) {
    const sourcePath = path.join(__dirname, "./index.json");
    const destPath = "/tmp/index.json";

    NestedComponent.transformTemplate(
        sourcePath,
        destPath,
        template => {
            template.Resources["WebsiteBucket"].DeletionPolicy = retainContent ? "Retain" : "Delete";
            return template;
        }
    );
}

/**
 * Upload Lambda packages
 *
 * @return {*} 
 */
async function uploadPackages() {
    return Promise.all([
        component.uploadComponentPackage(path.join(__dirname, "functions/cloudfront-key/package.zip"))
    ]);
}

(async () => {
    console.log("creating lambda edge");
    const arn = await createOriginRequestFunction("testing-lambda-edge");
    console.log("updating lambda edge");
    await updateOriginRequestFunction("testing-lambda-edge");
    console.log("deleting lambda edge");
    await deleteOriginRequestFunction("testing-lambda-edge");
})()

module.exports = component;