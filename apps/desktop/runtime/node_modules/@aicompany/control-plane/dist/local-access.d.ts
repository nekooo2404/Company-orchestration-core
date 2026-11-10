export interface LocalAccessRoot {
    id: string;
    label: string;
    path: string;
    exists: boolean;
    granted: boolean;
}
export declare const listLocalAccessRoots: (grantFile: string) => Promise<LocalAccessRoot[]>;
export declare const grantLocalAccessRoot: (grantFile: string, id: string) => Promise<void>;
//# sourceMappingURL=local-access.d.ts.map