# CDN (Content Delivery Network) component

Infrastructure setup for hosting Single Page Applications (SPA) and any other kind of public or private static content (e.g. images, PDFs etc.)

When private content restriction is enabled, you should use signed URLs or Cookies to access the private content. Request signing is only available within the same account where this component is provisioned.

This components provisiones:
- CloudFront distribution
- Private S3 Bucket
- Origin Access Identity to enable CloudFront to access the private S3 bucket

> Files stored in the S3 bucket can only be accessed through the CloudFront distribution endpoint.

The component can be configured to use a custom SSL certificate. This certificate should be provisioned in the N. Virginia (us-east-1) region, and it's only required if a custom domain is provided.

## Image resizing
This component has a built-in functionality for image resizing. Once resized once, then the image is cached and provided directly from the CDN.

To get resized version of an image you should provide the `convert` parameter in query string followed by the `width` or `height` parameter.

If just width or height is provided, the image will keep it's aspect ration. Otherwise, it will crop the image in the center by following the provided width and height.

E.g. `https://example.com/image.jpg?convert=true&width=100`

E.g. `https://example.com/image.jpg?convert=true&width=100&height=200`
## Technology stack
- NodeJS
- Microtica component library
- AWS CloudFormation

## Licensing

The code in this project is licensed under MIT license.