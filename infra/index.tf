provider "aws" {
  version = "~> 2.0"
  region  = "eu-central-1"
}

resource "aws_s3_bucket" "website-bucket" {
  bucket = "my-website-bucket-11234565433"
  acl    = "public-read"

  website {
    index_document = "index.html"
    error_document = "error.html"
  }
}