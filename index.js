const fs = require("fs");
const path = require("path");
const { NestedComponent } = require("@microtica/component").AwsCloud;
const { Lambda, IAM, STS, CloudFormation } = require("aws-sdk");
const concat = require("concat-stream");

const component = new NestedComponent(
    () => handleCreateOrUpdate("create"),
    () => handleCreateOrUpdate("update"),
    handleDelete,
    "/tmp/index.json",
);

async function handleCreateOrUpdate(action) {
    const { RetainContent, MIC_ENVIRONMENT_ID, MIC_RESOURCE_ID } = await component.getInputParameters();

    transformTemplate(RetainContent === "true");

    const [cloudfrontKeyPackage, imageConverterPackage] = await uploadPackages();

    const keyName = `${MIC_ENVIRONMENT_ID}-${MIC_RESOURCE_ID}`;

    let originRequestLambdaArn = "";
    try {
        if (action === "create") {
            originRequestLambdaArn = await createOriginRequestFunction(keyName, imageConverterPackage);
        } else if (action === "update") {
            originRequestLambdaArn = await updateOriginRequestFunction(keyName, imageConverterPackage);
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

async function createOriginRequestFunction(name, lambdaPackage) {
    const cfn = new CloudFormation({ region: "us-east-1" });

    await cfn.createStack({
        StackName: name,
        Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM", "CAPABILITY_AUTO_EXPAND"],
        TemplateBody: JSON.stringify(require("./functions/image-converter/cfn.json")),
        Parameters: [{
            ParameterKey: "ImageConverterLambdaBucket",
            ParameterValue: lambdaPackage.s3Bucket,
        }, {
            ParameterKey: "ImageConverterLambdaBucketKey",
            ParameterValue: lambdaPackage.s3Key,
        }]
    }).promise();

    await cfn.waitFor("stackCreateComplete", { StackName: name }).promise();

    const { Stacks: stacks } = await cfn.describeStacks({ StackName: name }).promise();

    return stacks[0].Outputs.find(o => o.OutputKey === "Version").OutputValue;
}

async function updateOriginRequestFunction(name, lambdaPackage) {
    const cfn = new CloudFormation({ region: "us-east-1" });

    await cfn.updateStack({
        TemplateBody: JSON.stringify(require("./functions/image-converter/cfn.json")),
        Parameters: [{
            ParameterKey: "ImageConverterLambdaBucket",
            ParameterValue: lambdaPackage.s3Bucket,
        }, {
            ParameterKey: "ImageConverterLambdaBucketKey",
            ParameterValue: lambdaPackage.s3Key,
        }]
    }).promise();

    await cfn.waitFor("stackUpdateComplete", { StackName: name }).promise();

    const { Stacks: stacks } = await cfn.describeStacks({ StackName: name }).promise();

    return stacks[0].Outputs.find(o => o.OutputKey === "Version").OutputValue;
}

async function deleteOriginRequestFunction(name) {
    const cfn = new CloudFormation({ region: "us-east-1" });

    await cfn.deleteStack({ StackName: name }).promise();
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
        component.uploadComponentPackage(path.join(__dirname, "functions/cloudfront-key/package.zip")),
        component.uploadComponentPackage(path.join(__dirname, "functions/image-converter/package.zip"))
    ]);
}

module.exports = component;