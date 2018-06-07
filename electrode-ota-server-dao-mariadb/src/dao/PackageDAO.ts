import { format, IConnection } from "mysql";

import BaseDAO from "./BaseDAO";
import DeploymentDAO from "./DeploymentDAO";
import HistoryDAO from "./HistoryDAO";

import { PackageDTO } from "../dto";

import {
    ClientRatioQueries,
    DeploymentPackageQueries,
    PackageContentQueries,
    PackageDiffQueries,
    PackageQueries,
    PackageTagQueries,
} from "../queries";

import { difference, differenceBy, includes, find } from "lodash";
import { connect } from "net";

import Encryptor from "../Encryptor";

export default class PackageDAO extends BaseDAO {
    public static async packageById(connection: IConnection, packageId: number): Promise<PackageDTO> {
        const results = await PackageDAO.query(connection, PackageQueries.getPackageById, [packageId]);

        if (!results || results.length === 0) {
            throw new Error("Not found. No package found for id [" + packageId + "]");
        }

        const result = results[0];

        const pkg = new PackageDTO();
        pkg.id = result.id;
        pkg.packageHash = result.package_hash;
        pkg.appVersion = result.app_version;
        pkg.blobUrl = result.blob_url;
        pkg.created_ = result.create_time;
        pkg.description = result.description;
        pkg.isDisabled = (result.is_disabled === 1);
        pkg.isMandatory = (result.is_mandatory === 1);
        pkg.label = result.label;
        pkg.manifestBlobUrl = result.manifest_blob_url;
        pkg.originalDeployment = result.original_deployment_name;
        pkg.originalLabel = result.original_label;
        pkg.releasedBy = result.released_by;
        pkg.releaseMethod = result.release_method;
        pkg.rollout = result.rollout;
        pkg.size = result.size;
        pkg.uploadTime = result.upload_time;
        Encryptor.instance.decryptDTO(pkg);

        pkg.diffPackageMap = await PackageDAO.getPackageDiffs(connection, pkg.id)
            .then(PackageDAO.transformOutgoingPackageDiffs);

        const tagResults = await PackageDAO.getPackageTags(connection, pkg.id);
        if (tagResults && tagResults.length > 0) {
            pkg.tags = tagResults.map((tagResult: any) => tagResult.tag_name);
        }

        return pkg;
    }

    public static async getNewestApplicablePackage(connection: IConnection, deploymentKey: string,
        tags: string[] | undefined): Promise<PackageDTO | void> {

        const deployment = await DeploymentDAO.deploymentForKey(connection, deploymentKey);
        const deploymentId = deployment.id;

        const query = (tags && tags.length > 0) ? PackageQueries.getMostRecentPackageIdByDeploymentAndTags :
            PackageQueries.getMostRecentPackageIdByDeploymentNoTags;

        const params = (tags && tags.length > 0) ? [deploymentId, tags, deploymentId] : [deploymentId];

        const result = await PackageDAO.query(connection, query, params);

        if (result && result.length > 0) {
            return await PackageDAO.packageById(connection, result[0].package_id);
        }
        return undefined;
    }

    public static async addPackage(connection: IConnection, deploymentKey: string,
        packageInfo: PackageDTO): Promise<PackageDTO> {
        const deployment = await DeploymentDAO.deploymentForKey(connection, deploymentKey);

        await PackageDAO.beginTransaction(connection);

        const insertResult = await PackageDAO.insertPackaage(connection, packageInfo);
        const pkgId = insertResult.insertId;

        await HistoryDAO.addHistory(connection, deployment.id, pkgId);

        if (packageInfo.tags && packageInfo.tags.length) {
            await PackageDAO.addPackageTags(connection, pkgId, packageInfo.tags);
        }

        await PackageDAO.commit(connection);

        return await PackageDAO.packageById(connection, pkgId);
    }

    public static async updatePackage(connection: IConnection, deploymentKey: string,
        packageInfo: any, label: string): Promise<PackageDTO> {
        const deployment = await DeploymentDAO.deploymentForKey(connection, deploymentKey);

        const history = await HistoryDAO.historyForDeployment(connection, deployment.id);

        if (!history || history.length === 0) {
            throw new Error("Not found. no deployment-package history for deployment key [" + deploymentKey + "]");
        }

        let pkgId = history[0].package_id;
        if (label) {
            const found = history.find((h: any) => h.label === label);
            if (found) {
                pkgId = found.package_id;
            }
        }

        const existing = await PackageDAO.packageById(connection, pkgId);

        await PackageDAO.beginTransaction(connection);

        // check if diffs changed
        if (packageInfo.diffPackageMap) {
            for (const packageHash of Object.keys(packageInfo.diffPackageMap)) {
                if (includes(Object.keys(existing.diffPackageMap), packageHash)) {
                    // Package hash already exist in diff package map, check diff entries
                    const newBundleDiffs: any = differenceBy(
                        packageInfo.diffPackageMap[packageHash],
                        existing.diffPackageMap[packageHash],
                        "bundleDiff");
                    if (newBundleDiffs.length > 0) {
                        const newDiffs = newBundleDiffs.map((b: any) => {
                            return {
                                bundleDiff: b.bundleDiff,
                                packageHash,
                                size: b.size,
                                url: b.url,
                            };
                        });
                        console.log(`newDiffs are JSON.stringify(${newDiffs})`)
                        await PackageDAO.addPackageDiffs(connection, pkgId, newDiffs);
                    }

                    const removedBundleDiffs: any = differenceBy(
                        existing.diffPackageMap[packageHash],
                        packageInfo.diffPackageMap[packageHash],
                        "bundleDiff");
                    if (removedBundleDiffs.length > 0) {
                        const pkgHashesAndBundleDiffToRemove = removedBundleDiffs.map((r: any) => ({
                            bundleDiff: r.bundleDiff,
                            pkgHash: packageHash,
                        }));
                        await PackageDAO.removePackageDiffs(connection, pkgId, pkgHashesAndBundleDiffToRemove);
                    }
                } else {
                    // Package hash does not yet exist, add
                    const newDiffs = packageInfo.diffPackageMap[packageHash].map((b: any) => {
                        return {
                            bundleDiff: b.bundleDiff,
                            packageHash,
                            size: b.size,
                            url: b.url,
                        };
                    });
                    console.log(`newDiffs are JSON.stringify(${newDiffs})`);
                    await PackageDAO.addPackageDiffs(connection, pkgId, newDiffs);
                }
            }

            //
            // Removed Entries
            const remDiffKeys = difference(
                Object.keys(existing.diffPackageMap),
                Object.keys(packageInfo.diffPackageMap));
            if (remDiffKeys.length > 0) {
                for (const remDiffKey of remDiffKeys) {
                    const pkgHashesAndBundleDiffToRemove = [];
                    for (const diffPackage of existing.diffPackageMap[remDiffKey]) {
                        pkgHashesAndBundleDiffToRemove.push({
                            bundleDiff: diffPackage.bundleDiff,
                            pkgHash: remDiffKey,
                        });
                    }
                    await PackageDAO.removePackageDiffs(connection, pkgId, pkgHashesAndBundleDiffToRemove);
                }
            }
        }

        // check if tags changed
        if (packageInfo.tags) {
            const newTags = difference(packageInfo.tags, existing.tags || []);
            if (newTags.length > 0) {
                await PackageDAO.addPackageTags(connection, pkgId, newTags);
                await PackageDAO.updatePackageTime(connection, pkgId);
            }

            if (existing.tags) {
                const removeTags = difference(existing.tags, packageInfo.tags);
                if (removeTags.length > 0) {
                    await PackageDAO.removePackageTags(connection, pkgId, removeTags);
                    await PackageDAO.updatePackageTime(connection, pkgId);
                }
            }
        }

        // check these properties we care about
        let changed = false;
        ["isDisabled", "isMandatory", "rollout", "appVersion", "description"].forEach((prop) => {
            const existingVal = (existing as any)[prop];
            if (packageInfo[prop] !== undefined &&
                packageInfo[prop] !== null &&
                packageInfo[prop] !== existingVal) {
                // if the value is different from what is in the db, mark changed as true
                // and update the property on existing.  Will use "existing" as data when passing to update function
                changed = true;
                (existing as any)[prop] = packageInfo[prop];
            }
        });

        if (changed) {
            await PackageDAO.updatePackageDB(connection, pkgId, existing);
        }

        await PackageDAO.commit(connection);
        return await PackageDAO.packageById(connection, pkgId);
    }

    public static async savePackageContent(connection: IConnection, packageHash: string,
        content: Buffer): Promise<void> {
        return PackageDAO.insertPackageContent(connection, packageHash, content);
    }

    public static async getPackageContent(connection: IConnection, packageHash: string): Promise<Buffer> {
        const contentResult = await PackageDAO.getPackageContentFromDB(connection, packageHash);
        if (contentResult && contentResult.length > 0) {
            return contentResult[0].content;
        } else {
            throw new Error("No package content found for packageHash " + packageHash);
        }
    }

    // public, but used internal to data layer
    public static async removePackage(connection: IConnection, pkgId: number): Promise<void> {
        // these can run in parallel
        await Promise.all([
            // delete client_ratio
            PackageDAO.query(connection, ClientRatioQueries.deleteClientRatioByPackageId, [pkgId]),

            // delete tags
            PackageDAO.query(connection, PackageTagQueries.deletePackageTagsByPackageId, [pkgId]),

            // delete package content
            PackageDAO.query(connection, PackageContentQueries.deletePackageContentByPkgId, [pkgId]),

            // delete package_diff
            PackageDAO.query(connection, PackageDiffQueries.deletePackageDiffByLeftPkgId, [pkgId]),
            PackageDAO.query(connection, PackageDiffQueries.deletePackageDiffByRightPkgId, [pkgId]),

            // delete deployment_package_history
            PackageDAO.query(connection, DeploymentPackageQueries.deleteDeploymentPackageByPackageId,
                [pkgId]),
        ]);

        // delete package
        await PackageDAO.query(connection, PackageQueries.deletePackage, [pkgId]);
    }

    // only used in DAO
    public static async getLatestPackageForDeployment(connection: IConnection,
        deploymentId: number): Promise<PackageDTO | undefined> {
        const results = await PackageDAO.query(connection, DeploymentPackageQueries.getHistoryByDeploymentId,
            [deploymentId]);

        if (results && results.length > 0) {
            // newest package should be first in the list according to query result ordering
            return await PackageDAO.packageById(connection, results[0].package_id);
        }
        return undefined;
    }

    private static async getPackageByHash(connection: IConnection, pkgHash: string): Promise<any> {
        return PackageDAO.query(connection, PackageQueries.getPackageByHash, [pkgHash]);
    }

    private static async insertPackaage(connection: IConnection, pkg: PackageDTO): Promise<any> {
        /*
        app_version, blob_url, description,
        is_disabled, is_mandatory, label,
        manifest_blob_url, original_deployment_name, original_label,
        package_hash, release_method, released_by,
        rollout, size, upload_time
         */

        return PackageDAO.query(connection, PackageQueries.insertPackage,
            [pkg.appVersion, pkg.blobUrl, pkg.description,
            pkg.isDisabled, pkg.isMandatory, pkg.label,
            pkg.manifestBlobUrl, pkg.originalDeployment, pkg.originalLabel,
            pkg.packageHash, pkg.releaseMethod, Encryptor.instance.encrypt("package.released_by", pkg.releasedBy),
            pkg.rollout, pkg.size]);
    }

    private static async updatePackageDB(connection: IConnection, pkgId: number,
        updateInfo: PackageDTO): Promise<any> {
        /*
            SET is_disabled = ?,
            is_mandatory = ?,
            rollout = ?,
            app_version = ?,
            description = ?
            WHERE id = ?`
        */
        return PackageDAO.query(connection, PackageQueries.updatePackage,
            [updateInfo.isDisabled, updateInfo.isMandatory, updateInfo.rollout,
            updateInfo.appVersion, updateInfo.description, pkgId]);
    }

    private static async updatePackageTime(connection: IConnection, pkgId: number) {
        return PackageDAO.query(connection, PackageQueries.updatePackageTime, [pkgId]);
    }

    private static async addPackageDiffs(connection: IConnection, pkgId: number, pkgDiffs: any[]): Promise<any> {
        return Promise.all(pkgDiffs.map((pkgDiff) => {
            return PackageDAO.getPackageByHash(connection, pkgDiff.packageHash).then((pkgResults) => {
                const rightPkgId = pkgResults[0].id;
                return PackageDAO.insertPackageDiff(
                    connection, pkgId, rightPkgId, pkgDiff.size, pkgDiff.url, pkgDiff.bundleDiff);
            });
        }));
    }

    // pkgHashesAndBundleDiff : ({pkgHash: string, bundleDiff: string})[]
    private static async removePackageDiffs(connection: IConnection, pkgId: number, pkgHashesAndBundleDiff: any[]): Promise<any> {
        return Promise.all(pkgHashesAndBundleDiff.map((pkgHashAndBundleDiff) => {
            return PackageDAO.getPackageByHash(connection, pkgHashAndBundleDiff.pkgHash).then((pkgResults) => {
                const rightPkgId = pkgResults[0].id;
                return PackageDAO.deletePackageDiff(connection, pkgId, rightPkgId, pkgHashAndBundleDiff.bundleDiff);
            });
        }));
    }

    private static async addPackageTags(connection: IConnection, pkgId: number, tags: string[]): Promise<any> {
        return Promise.all(tags.map((tag) => {
            return PackageDAO.insertPackageTag(connection, pkgId, tag);
        }));
    }

    private static async removePackageTags(connection: IConnection, pkgId: number, tags: string[]): Promise<any> {
        return Promise.all(tags.map((tag) => {
            return PackageDAO.deletePackageTag(connection, pkgId, tag);
        }));
    }

    private static async insertPackageDiff(connection: IConnection, leftPkgId: number,
        rightPkgId: number, size: number, url: string, bundleDiff: string = 'none'): Promise<any> {
        return PackageDAO.query(connection, PackageDiffQueries.insertPackageDiff,
            [leftPkgId, rightPkgId, size, url, bundleDiff]);
    }

    private static async deletePackageDiff(connection: IConnection, leftPkgId: number,
        rightPkgId: number, bundleDiff: string): Promise<any> {
        return PackageDAO.query(connection, PackageDiffQueries.deletePackageDiff, [leftPkgId, rightPkgId, bundleDiff]);
    }

    private static async getPackageDiffs(connection: IConnection, pkgId: number): Promise<any> {
        return PackageDAO.query(connection, PackageDiffQueries.getPackageDiffsForLeftPkgId, [pkgId]);
    }

    private static async deletePackageTag(connection: IConnection, pkgId: number, tag: string): Promise<any> {
        return PackageDAO.query(connection, PackageTagQueries.deletePackageTag, [pkgId, tag]);
    }

    private static async insertPackageTag(connection: IConnection, pkgId: number, tag: string): Promise<any> {
        return PackageDAO.query(connection, PackageTagQueries.insertPackageTag, [pkgId, tag]);
    }

    private static async getPackageTags(connection: IConnection, pkgId: number): Promise<any> {
        return PackageDAO.query(connection, PackageTagQueries.getTagsForPackage, [pkgId]);
    }

    private static async insertPackageContent(connection: IConnection, pkgHash: string, content: Buffer): Promise<void> {
        return PackageDAO.query(connection, PackageContentQueries.insertPackageContent, [pkgHash, content]);
    }

    private static async getPackageContentFromDB(connection: IConnection, pkgHash: string): Promise<any> {
        return PackageDAO.query(connection, PackageContentQueries.getPackageContentByPkgHash, [pkgHash]);
    }

    private static transformOutgoingPackageDiffs(pkgDiffs: any[]): any {
        return pkgDiffs.reduce((obj, pkgDiff) => {
            const value = {
                bundleDiff: pkgDiff.bundle_diff,
                size: pkgDiff.size,
                url: pkgDiff.url,
            };
            if (obj[pkgDiff.package_hash]) {
                obj[pkgDiff.package_hash].push(value);
            } else {
                obj[pkgDiff.package_hash] = [ value ];
            }
            return obj;
        }, {} as any);
    }
}
