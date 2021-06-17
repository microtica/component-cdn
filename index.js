const path = require("path");
const random = require("randomstring");
const { NestedComponent } = require("@microtica/component").AwsCloud;

const component = new NestedComponent(
    handleCreateOrUpdate,
    handleCreateOrUpdate,
    async () => { },
    "/tmp/index.json",
);

async function handleCreateOrUpdate() {
    const { RetainContent, MIC_ENVIRONMENT_ID, MIC_RESOURCE_ID } = await component.getInputParameters();

    transformTemplate(RetainContent === "true");

    const [lambdaPackage] = await uploadPackages();

    const keyName = `${MIC_ENVIRONMENT_ID}-${MIC_RESOURCE_ID}`;

    return {
        KeyName: keyName,
        CloudfrontKeyLambdaBucket: lambdaPackage.s3Bucket,
        CloudfrontKeyLambdaBucketKey: lambdaPackage.s3Key,
    };
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

module.exports = component;