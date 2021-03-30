const path = require("path");
const { NestedComponent } = require("@microtica/component").AwsCloud;

const component = new NestedComponent(
    handleCreateOrUpdate,
    handleCreateOrUpdate,
    async () => { },
    "/tmp/index.json",
);

async function handleCreateOrUpdate() {
    const { RetainContent } = await component.getInputParameters();

    transformTemplate(RetainContent === "true");

    return {};
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