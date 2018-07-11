INSERT INTO user (email, name) VALUES ('lemaireb@gmail.com', 'Benoit');

INSERT INTO access_key (user_id, name, created_by, expires, last_access, friendly_name, description)
VALUES (1, 'nIuHktiSebWrsjvswelpHaGgSkhclHURTUWFzmbb', NULL, '2020-08-23 22:04:10.915', NULL, 'Benoit', 'Benoit');

INSERT INTO app (name) VALUES ('TestAndroidApp');

INSERT INTO app_permission (app_id, user_id, permission) VALUES (1, 1, 'Owner');

INSERT INTO deployment (name, deployment_key) VALUES ('Production', 'yZIrvYgfgzgGZQmaBjRheHMQDIGUlYEyTGPvxUov');
INSERT INTO deployment (name, deployment_key) VALUES ('Staging', 'tiGvmHfmPfZFgcXITaaUHcVHCnWeneMZtMmyAszB');

INSERT INTO deployment_app (app_id, deployment_id) VALUES(1, 1);
INSERT INTO deployment_app (app_id, deployment_id) VALUES(1, 2);

INSERT INTO user_auth_provider (user_id, provider) VALUES (1, 'basic-auth');