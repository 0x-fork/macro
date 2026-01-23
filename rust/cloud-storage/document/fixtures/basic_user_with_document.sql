INSERT INTO public."User" ("id","email","stripeCustomerId")
(SELECT 'macro|user@user.com', 'user@user.com','stripe_id');

INSERT INTO public."Document" ("id","name","fileType", "owner")
(SELECT 'document-one', 'test_document_name','pdf', 'macro|user@user.com');

INSERT INTO public."DocumentInstance" ("documentId", "sha")
VALUES ('document-one', 'abc123');

INSERT INTO public."UploadJob" ("id","jobId","jobType", "documentId")
(SELECT 1, 'job-id', 'job-type', 'document-one');
