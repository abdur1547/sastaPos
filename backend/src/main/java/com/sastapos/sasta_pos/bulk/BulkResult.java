package com.sastapos.sasta_pos.bulk;

import java.util.ArrayList;
import java.util.List;


public final class BulkResult {

    private int applied;
    private final List<BulkRejection> rejections = new ArrayList<>();

    public int applied() {
        return applied;
    }

    public List<BulkRejection> rejections() {
        return rejections;
    }

    void addApplied(final int count) {
        applied += count;
    }

    void reject(final String id, final String reason) {
        rejections.add(new BulkRejection(id, reason));
    }

    public void merge(final BulkResult other) {
        applied += other.applied;
        rejections.addAll(other.rejections);
    }

}
