For a while the performance of the sync service has been mediocre. This is attributable to two things:


The `/exists` endpoint:
The exists endpoint exists to check wether the document exists in the sync service already. There are a couple of cases where a document can "exist" in macro but not yet be initialized in the sync service.
Specifically 1) documents that where created before the sync service existed and thus need to be migrated to the sync service. 2) Documents that where manually uploaded and not yet initialized.

The initial websocket connection.
The initial websocket connection passes down the entire snapshot of the document on the first connection.




Another seperate but related problem is that when the content of a document gets updated in the sync service, we don't properly update the updated at time in dss.


I think we can kill three birds with one stone here.


I think we can move the `exists` or really what this is saying is that location===sync_service, to be stored in dss with faster acccess patterns. Simmilarly I think a latest version of the loro snapshot can be stored in dss and should also have a quick access pattern to load the document from and then lazily connect to the sync service.

This way we have a cache of both does this document exist in sync service and its latest snapshot all together.
