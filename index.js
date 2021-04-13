const path = require("path");
const { SecretsManager } = require("aws-sdk");
const { NestedComponent } = require("@microtica/component").AwsCloud;

const component = new NestedComponent(
    handleCreateOrUpdate,
    handleCreateOrUpdate,
    async () => { },
    "/tmp/index.json",
);

async function handleCreateOrUpdate() {
    const { RetainContent, PublicKey, MIC_ENVIRONMENT_ID } = await component.getInputParameters();

    transformTemplate(RetainContent === "true");

    console.log("PublicKey", PublicKey)

    let publicKey = "";
    if (PublicKey && PublicKey.includes("arn:aws:secretsmanager")) {
        const { SecretString: secret } = await new SecretsManager().getSecretValue({
            SecretId: PublicKey
        }).promise();

        console.log("SecretString", secret);
        console.log("publicKey", secret.publicKey);

        // const secret = JSON.parse(SecretString);

        publicKey = secret.publicKey;

    } else {
        publicKey = PublicKey;
    }

    return {
        EncodedKey: publicKey,
        KeyName: MIC_ENVIRONMENT_ID
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

module.exports = component;