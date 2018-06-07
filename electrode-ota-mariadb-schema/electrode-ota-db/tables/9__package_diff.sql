--liquibase formatted sql

--changeset awhelms:electrode_ota_db_0_0_1 dbms:mysql
CREATE TABLE package_diff (
	left_package_id MEDIUMINT UNSIGNED NOT NULL,
	right_package_id MEDIUMINT UNSIGNED NOT NULL,
	size MEDIUMINT UNSIGNED NOT NULL,
	url VARCHAR(256) NOT NULL,
	
	CONSTRAINT PRIMARY KEY (left_package_id, right_package_id),
	CONSTRAINT fk_left_package_diff FOREIGN KEY (left_package_id) REFERENCES package (id),
	CONSTRAINT fk_right_package_idff FOREIGN KEY (left_package_id) REFERENCES package (id)
);

--changeset awhelms:electrode_ota_db_0_0_5 dbms:mysql
ALTER TABLE package_diff MODIFY COLUMN size BIGINT UNSIGNED;

--changeset belemaire:electrode_ota_db_0_0_11 dbms:mysql
ALTER TABLE package_diff ADD COLUMN bundle_diff VARCHAR(32) NOT NULL DEFAULT 'none';




CREATE TABLE package_diff (
	left_package_id MEDIUMINT UNSIGNED NOT NULL,
	right_package_id MEDIUMINT UNSIGNED NOT NULL,
	size BIGINT UNSIGNED NOT NULL,
	url VARCHAR(256) NOT NULL,
	bundle_diff VARCHAR(32) NOT NULL DEFAULT 'none',
	
	CONSTRAINT PRIMARY KEY (left_package_id, right_package_id, bundle_diff),
	CONSTRAINT fk_left_package_diff FOREIGN KEY (left_package_id) REFERENCES package (id),
	CONSTRAINT fk_right_package_idff FOREIGN KEY (left_package_id) REFERENCES package (id)
);