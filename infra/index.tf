provider "aws" {
  version = "~> 2.0"
  region  = "eu-central-1"
}


resource "aws_s3_bucket" "website-bucket-tf-state" {
  bucket = "my-website-bucket-tf-state-11234565433"
  
  versioning {
    enabled = true
  }
}

terraform {
 backend "s3" {
   encrypt = true
   bucket = "my-website-bucket-tf-state-11234565433"
   region = "eu-central-1"
   key = "state"
 }
}

resource "aws_s3_bucket" "website-bucket" {
  bucket = "my-website-bucket-11234565433"
  acl    = "public-read"

  website {
    index_document = "index.html"
    error_document = "error.html"
  }
}