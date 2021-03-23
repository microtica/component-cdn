# SPA infrastructure component

Infrastructure setup for hosting Single Page Applications (SPA). 

This components provisiones:
- CloudFront distribution
- Private S3 Bucket
- Origin Access Identity to enable CloudFront to access the private S3 bucket

> Files stored in the S3 bucket can only be accessed through the CloudFront distribution endpoint.

The component can be configured to use a custom SSL certificate. This certificate should be provisioned in the N. Virginia (us-east-1) region, and it's only required if a custom domain is provided.

## Technology stack
- NodeJS
- Microtica component library
- AWS CloudFormation

## Licensing

The code in this project is licensed under MIT license.